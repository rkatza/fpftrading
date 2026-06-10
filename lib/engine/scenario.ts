import { Decimal, dec } from "@/lib/money";
import { computeExposures, type CcyExposure } from "./exposure";
import { estimateMargin, type MarginEstimate, type MarginConfig } from "./margin";
import type { CashInput, HedgeInput, MarketView, PositionInput } from "./types";

/**
 * Scenario engine: shock the market, recompute the book.
 * Shocks apply to the local ccy value: spotPct +0.05 = local ccy appreciates
 * 5% vs USD (USD-per-unit quote rises 5%).
 */
export interface Shock {
  /** e.g. -0.10 = local ccy depreciates 10% */
  spotPct: Decimal;
  /** parallel shift of forward outrights, in bps of the rate (1bp = 0.0001 relative) */
  fwdPointsBps: Decimal;
  /** vol points added to ATM (e.g. 0.02 = +2 vol pts) — used by option lab */
  volPts: Decimal;
  /** restrict to one ccy, or undefined = all */
  ccy?: string;
}

export const PRESET_SHOCKS: { label: string; spotPct: string }[] = [
  { label: "-15%", spotPct: "-0.15" },
  { label: "-10%", spotPct: "-0.10" },
  { label: "-5%", spotPct: "-0.05" },
  { label: "+5%", spotPct: "0.05" },
  { label: "+10%", spotPct: "0.10" },
  { label: "+15%", spotPct: "0.15" },
];

export function shockMarket(market: MarketView, shock: Shock): MarketView {
  const applies = (ccy: string) => !shock.ccy || shock.ccy === ccy;
  const spotMult = dec(1).plus(shock.spotPct);
  const fwdShift = shock.fwdPointsBps.mul("0.0001");

  const spot: Record<string, Decimal> = {};
  for (const [ccy, s] of Object.entries(market.spot)) {
    spot[ccy] = applies(ccy) ? s.mul(spotMult) : s;
  }

  return {
    spot,
    usdRate: market.usdRate,
    forwardTo(ccy: string, date: Date) {
      const f = market.forwardTo(ccy, date);
      if (!f) return undefined;
      if (!applies(ccy)) return f;
      // spot shock propagates through the curve; points shift in relative bps
      return f.mul(spotMult).mul(dec(1).plus(fwdShift));
    },
  };
}

export interface ScenarioResult {
  shock: { spotPct: string; fwdPointsBps: string; volPts: string; ccy?: string };
  base: CcyExposure[];
  shocked: CcyExposure[];
  /** Δ hedge MTM in USD (shocked − base), total. */
  hedgeMtmDeltaUsd: Decimal;
  /** Δ value of unhedged exposure (gross moves with spot). */
  exposureDeltaUsd: Decimal;
  /** net P&L = exposure Δ + hedge MTM Δ */
  netPnlUsd: Decimal;
  margin: { base: MarginEstimate; shocked: MarginEstimate };
}

export function runScenario(
  positions: PositionInput[],
  cash: CashInput[],
  hedges: HedgeInput[],
  market: MarketView,
  valuationDate: Date,
  shock: Shock,
  marginConfig: MarginConfig
): ScenarioResult {
  const base = computeExposures(positions, cash, hedges, market, valuationDate);
  const shockedMkt = shockMarket(market, shock);
  const shocked = computeExposures(positions, cash, hedges, shockedMkt, valuationDate);

  let hedgeMtmDeltaUsd = dec(0);
  let exposureDeltaUsd = dec(0);
  for (let i = 0; i < base.length; i++) {
    hedgeMtmDeltaUsd = hedgeMtmDeltaUsd.plus(shocked[i].hedgeMtmUsd.minus(base[i].hedgeMtmUsd));
    // position exposure is USD-marked but FX-linked: it moves with the spot shock
    const applies = !shock.ccy || shock.ccy === base[i].ccy;
    if (applies) {
      exposureDeltaUsd = exposureDeltaUsd.plus(base[i].grossExposureUsd.mul(shock.spotPct));
    }
  }

  return {
    shock: {
      spotPct: shock.spotPct.toString(),
      fwdPointsBps: shock.fwdPointsBps.toString(),
      volPts: shock.volPts.toString(),
      ccy: shock.ccy,
    },
    base,
    shocked,
    hedgeMtmDeltaUsd,
    exposureDeltaUsd,
    netPnlUsd: exposureDeltaUsd.plus(hedgeMtmDeltaUsd),
    margin: {
      base: estimateMargin(hedges, market, marginConfig),
      shocked: estimateMargin(hedges, shockedMkt, marginConfig),
    },
  };
}
