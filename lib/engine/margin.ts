import { Decimal, dec, ZERO } from "@/lib/money";
import { baseCcy, type HedgeInput, type MarketView } from "./types";

/**
 * Margin estimator: required ≈ Σ open notional(USD) × ccy risk weight,
 * less a configurable netting benefit. Crude by design (v1) — compared
 * against posted collateral to flag shortfall/excess.
 */
export interface MarginConfig {
  /** risk weight per ccy, e.g. { PEN: 0.06 }; falls back to defaultWeight */
  weights: Record<string, Decimal>;
  defaultWeight: Decimal; // EM default 5–8%
  nettingBenefit: Decimal; // 0–1 fraction subtracted from gross requirement
}

export const DEFAULT_MARGIN_CONFIG: MarginConfig = {
  weights: {},
  defaultWeight: dec("0.06"),
  nettingBenefit: dec("0.10"),
};

export interface MarginEstimate {
  grossNotionalUsd: Decimal;
  requiredUsd: Decimal;
}

export function estimateMargin(hedges: HedgeInput[], market: MarketView, cfg: MarginConfig): MarginEstimate {
  let gross = ZERO;
  let required = ZERO;
  for (const h of hedges) {
    if (h.status === "settled") continue;
    const ccy = baseCcy(h.pair);
    const fwd = market.forwardTo(ccy, h.fixingDate) ?? market.spot[ccy];
    if (!fwd) continue;
    const usd = h.notionalLocal.mul(fwd).abs();
    gross = gross.plus(usd);
    const w = cfg.weights[ccy] ?? cfg.defaultWeight;
    required = required.plus(usd.mul(w));
  }
  required = required.mul(dec(1).minus(cfg.nettingBenefit));
  return { grossNotionalUsd: gross, requiredUsd: required };
}

export function marginShortfall(postedUsd: Decimal, requiredUsd: Decimal): Decimal {
  // positive = shortfall, negative = excess
  return requiredUsd.minus(postedUsd);
}
