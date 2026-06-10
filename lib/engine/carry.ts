import { Decimal, dec } from "@/lib/money";

/**
 * Annualized carry of a forward hedge:
 *   carry = (forward − spot) / spot × 365 / days
 *
 * For a short-local hedger (FPF selling PEN forward), positive carry means
 * the forward sells above spot — the hedge *earns* the points; negative
 * means hedging costs that many % per year.
 */
export function annualizedCarry(spot: Decimal, forward: Decimal, days: number): Decimal {
  if (days <= 0) return dec(0);
  return forward.minus(spot).div(spot).mul(dec(365).div(days));
}

/** USD cost/earn per year of hedging `hedgeUsd` notional at this carry. */
export function carryUsdPerYear(hedgeUsd: Decimal, carry: Decimal): Decimal {
  return hedgeUsd.mul(carry);
}
