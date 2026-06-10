import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dec } from "@/lib/money";
import { fetchAllCentralBankRates } from "@/lib/marketdata/centralbanks";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { loadBook } from "@/lib/book";
import { computeExposures } from "@/lib/engine/exposure";
import { generateAlerts } from "@/lib/engine/alerts";
import { estimateMargin, DEFAULT_MARGIN_CONFIG } from "@/lib/engine/margin";

export const maxDuration = 120;

/** Daily 22:00 UTC: central-bank rates, exposure snapshot, alerts. */
export async function GET(request: Request) {
  const header = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || header !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Central-bank rates (tolerant to individual failures)
  const { quotes, errors } = await fetchAllCentralBankRates();
  for (const q of quotes) {
    await prisma.marketQuote.create({
      data: { pair: q.pair, tenor: q.tenor, type: "interest_rate", value: q.value.toFixed(8), source: q.source, quotedAt: q.quotedAt },
    });
  }

  // 2. Exposure snapshot (immutable, unique per date+ccy)
  const [book, market] = await Promise.all([loadBook(), loadMarketView()]);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const exposures = computeExposures(book.positionInputs, book.cashInputs, book.hedgeInputs, market, now);
  for (const e of exposures) {
    await prisma.exposureSnapshot.upsert({
      where: { date_ccy: { date: today, ccy: e.ccy } },
      create: {
        date: today,
        ccy: e.ccy,
        grossExposureUsd: e.grossExposureUsd.toFixed(2),
        cashUsd: e.cashUsd.toFixed(2),
        hedgeNotionalUsd: e.hedgeNotionalUsd.toFixed(2),
        netExposureUsd: e.netExposureUsd.toFixed(2),
        hedgeRatio: (e.hedgeRatio ?? dec(0)).toFixed(6),
        hedgeMtmUsd: e.hedgeMtmUsd.toFixed(2),
      },
      update: {}, // snapshots are immutable once written
    });
  }

  // 3. Margin record vs. posted
  const margin = estimateMargin(book.hedgeInputs, market, DEFAULT_MARGIN_CONFIG);
  const posted = book.cash
    .filter((c) => c.isMarginAccount)
    .reduce((a, c) => a.plus(dec(c.amount.toString())), dec(0));

  // 4. Alerts: day/day spot moves from stored closes
  const spotMoves: Record<string, ReturnType<typeof dec>> = {};
  for (const ccy of Object.keys(market.spot)) {
    const last2 = await prisma.marketQuote.findMany({
      where: { pair: `${ccy}/USD`, type: "spot" },
      orderBy: { quotedAt: "desc" },
      take: 2,
    });
    if (last2.length === 2 && !dec(last2[1].value.toString()).isZero()) {
      spotMoves[ccy] = dec(last2[0].value.toString()).div(dec(last2[1].value.toString())).minus(1);
    }
  }

  const candidates = generateAlerts({
    valuationDate: now,
    hedges: book.hedgeInputs,
    exposures,
    policies: book.policies.map((p) => ({ ccy: p.ccy, min: dec(p.targetRatioMin.toString()), max: dec(p.targetRatioMax.toString()) })),
    spotMoves,
    margin: [{ counterparty: "all", postedUsd: posted, requiredUsd: margin.requiredUsd }],
  });

  let created = 0;
  for (const a of candidates) {
    // dedupe: skip if an unacknowledged alert with the same message exists
    const existing = await prisma.alert.findFirst({ where: { message: a.message, acknowledgedAt: null } });
    if (!existing) {
      await prisma.alert.create({ data: { type: a.type, severity: a.severity, message: a.message, ccy: a.ccy, hedgeId: a.hedgeId } });
      created++;
    }
  }

  return NextResponse.json({ ok: true, rates: quotes.length, rateErrors: errors, snapshots: exposures.length, alertsCreated: created });
}
