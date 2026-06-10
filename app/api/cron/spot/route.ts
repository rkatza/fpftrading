import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dec } from "@/lib/money";
import { TwelveDataProvider } from "@/lib/marketdata/twelvedata";
import { TraderMadeProvider } from "@/lib/marketdata/tradermade";
import { resolveSpot } from "@/lib/marketdata/resolve";
import { cipForward } from "@/lib/marketdata/cip";
import { TRACKED_PAIRS } from "@/lib/marketdata/types";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  return !!process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`;
}

/** 15-min spot refresh (Vercel cron). Resolution order per CLAUDE.md. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const providers = [new TwelveDataProvider(), new TraderMadeProvider()];
  const results: Record<string, string> = {};

  for (const pair of TRACKED_PAIRS) {
    const ccy = pair.split("/")[0];
    const quote = await resolveSpot(pair, {
      providers,
      manualFreshHours: 4,
      getManual: async () => {
        const q = await prisma.marketQuote.findFirst({
          where: { pair, type: "spot", source: "manual" },
          orderBy: { quotedAt: "desc" },
        });
        return q ? { pair, tenor: "SPOT", value: dec(q.value.toString()), source: q.source, quotedAt: q.quotedAt } : null;
      },
      getCipDerived: async () => {
        // CIP can't derive spot itself; degrade to last-good below
        return null;
      },
      getLastGood: async () => {
        const q = await prisma.marketQuote.findFirst({
          where: { pair, type: "spot" },
          orderBy: { quotedAt: "desc" },
        });
        return q ? { pair, tenor: "SPOT", value: dec(q.value.toString()), source: q.source, quotedAt: q.quotedAt } : null;
      },
    });

    if (!quote) {
      results[pair] = "no source available";
      continue;
    }
    // persist only fresh API/manual data — re-persisting last-good would fake freshness
    const isNew = Date.now() - quote.quotedAt.getTime() < 60_000;
    if (isNew) {
      await prisma.marketQuote.create({
        data: { pair, tenor: "SPOT", type: "spot", value: quote.value.toFixed(8), source: quote.source, quotedAt: quote.quotedAt },
      });
      // refresh CIP-derived forward curve points off the new spot
      const rates = await prisma.marketQuote.findMany({ where: { type: "interest_rate" }, orderBy: { quotedAt: "desc" } });
      const rLocal = rates.find((r) => r.pair === ccy);
      const rUsd = rates.find((r) => r.pair === "USD");
      if (rLocal && rUsd) {
        for (const [tenor, days] of [["1M", 30], ["3M", 91], ["6M", 182], ["12M", 365]] as const) {
          const fwd = cipForward(quote.value, dec(rLocal.value.toString()), dec(rUsd.value.toString()), days);
          await prisma.marketQuote.create({
            data: { pair, tenor, type: "forward_outright", value: fwd.toFixed(8), source: "cip", quotedAt: new Date() },
          });
        }
      }
    }
    results[pair] = `${quote.source} ${quote.value.toFixed(6)}${isNew ? "" : " (stale, not re-persisted)"}`;
  }

  return NextResponse.json({ ok: true, results });
}
