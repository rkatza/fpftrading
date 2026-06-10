import { loadBook } from "@/lib/book";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { computeExposures } from "@/lib/engine/exposure";
import { annualizedCarry } from "@/lib/engine/carry";
import { daysToFixing } from "@/lib/engine/mtm";
import { baseCcy } from "@/lib/engine/types";

/**
 * Compact JSON context for AI prompts: exposures, hedge book, policies,
 * rates. Read-only — the AI layer never writes to Position/Hedge tables.
 */
export async function buildBookContext() {
  const [book, market] = await Promise.all([loadBook(), loadMarketView()]);
  const now = new Date();
  const exposures = computeExposures(book.positionInputs, book.cashInputs, book.hedgeInputs, market, now);

  return {
    asOf: now.toISOString(),
    baseCurrency: "USD",
    exposures: exposures
      .filter((e) => !e.grossExposureUsd.isZero() || e.openHedgeCount > 0)
      .map((e) => ({
        ccy: e.ccy,
        grossUsd: e.grossExposureUsd.toFixed(0),
        hedgedUsd: e.hedgeNotionalUsd.toFixed(0),
        netUsd: e.netExposureUsd.toFixed(0),
        hedgeRatio: e.hedgeRatio?.toFixed(3) ?? null,
        hedgeMtmUsd: e.hedgeMtmUsd.toFixed(0),
      })),
    hedges: book.hedges
      .filter((h) => h.status !== "settled")
      .map((h) => ({
        pair: h.pair,
        type: h.type,
        direction: h.direction,
        notionalLocal: h.notionalLocal.toString(),
        contractRate: h.contractRate.toString(),
        fixingDate: h.fixingDate.toISOString().slice(0, 10),
        daysToFixing: daysToFixing(now, h.fixingDate),
        counterparty: h.counterparty.name,
        forwardToFixing: market.forwardTo(baseCcy(h.pair), h.fixingDate)?.toFixed(8) ?? null,
      })),
    policies: book.policies.map((p) => ({
      ccy: p.ccy,
      band: [p.targetRatioMin.toString(), p.targetRatioMax.toString()],
    })),
    market: {
      spot: Object.fromEntries(Object.entries(market.spot).map(([c, v]) => [c, v.toFixed(8)])),
      usdRate: market.usdRate.toFixed(4),
      localRates: Object.fromEntries(Object.entries(market.rates).map(([c, v]) => [c, v.toFixed(4)])),
      carry3m: Object.fromEntries(
        Object.entries(market.spot).flatMap(([c, s]) => {
          const fwd = market.forwardTo(c, new Date(now.getTime() + 91 * 86_400_000));
          return fwd ? [[c, annualizedCarry(s, fwd, 91).toFixed(4)]] : [];
        })
      ),
    },
    positions: book.positions
      .filter((p) => p.status === "active")
      .map((p) => ({
        borrower: p.borrower,
        country: p.country,
        mvUsd: p.marketValueUsd.toFixed(0),
        underlyingCcy: p.underlyingCcy,
        exposureFactor: p.exposureFactor.toString(),
      })),
  };
}

export type BookContext = Awaited<ReturnType<typeof buildBookContext>>;
