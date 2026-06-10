import Decimal from "decimal.js";

// All financial math runs through decimal.js — never floats.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export type DecimalLike = Decimal | string | number;

export const dec = (v: DecimalLike): Decimal => new Decimal(v);

export const ZERO = new Decimal(0);

/** Rates display/persist at 8 dp. */
export const rate8 = (v: DecimalLike): string => dec(v).toFixed(8);

/** USD amounts display/persist at 2 dp. */
export const usd2 = (v: DecimalLike): string => dec(v).toFixed(2);

/** Calendar days between two dates (UTC midnight to UTC midnight). */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

export function fmtUsd(v: DecimalLike): string {
  const d = dec(v);
  return (
    (d.isNegative() ? "-$" : "$") +
    d.abs().toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtPct(v: DecimalLike, dp = 1): string {
  return dec(v).mul(100).toFixed(dp) + "%";
}
