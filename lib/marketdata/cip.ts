import { Decimal, dec } from "@/lib/money";

/**
 * Covered interest parity forward, fund convention (USD per local unit):
 *
 *   F = S × (1 + r_usd × t) / (1 + r_local × t),  t = days/360
 *
 * Intuition: with S in USD-per-local, the higher-yielding local currency
 * trades at a forward discount. (In local-per-USD terms this is the
 * familiar F' = S' × (1+r_local t)/(1+r_usd t) — same statement, inverted.)
 */
export function cipForward(spotUsdPerLocal: Decimal, rLocal: Decimal, rUsd: Decimal, days: number): Decimal {
  const t = dec(days).div(360);
  return spotUsdPerLocal
    .mul(dec(1).plus(rUsd.mul(t)))
    .div(dec(1).plus(rLocal.mul(t)));
}

/** Sanity check a manual forward quote vs. the CIP-implied value (±10% warn). */
export function cipDeviation(quote: Decimal, cipImplied: Decimal): Decimal {
  if (cipImplied.isZero()) return dec(0);
  return quote.minus(cipImplied).div(cipImplied);
}
