import { Decimal, dec, daysBetween, ZERO } from "@/lib/money";
import type { Direction } from "./types";

/**
 * NDF / deliverable forward mark-to-market, in USD.
 *
 * Convention: pair quoted as USD per 1 local unit; notional in local ccy.
 *  - sell (short local fwd):  MTM = N × (K − F) × DF
 *  - buy  (long local fwd):   MTM = N × (F − K) × DF
 * DF discounts from settlement to valuation at the USD rate, act/360:
 *  DF = 1 / (1 + r × d/360)
 *
 * Sanity anchor (CLAUDE.md): GS book short PEN at K≈0.294 vs F≈0.284
 * → positive MTM. ✓
 */
export interface NdfMtmInput {
  direction: Direction;
  notionalLocal: Decimal;
  contractRate: Decimal;
  forwardToFixing: Decimal;
  usdRate: Decimal; // annualized, e.g. 0.043
  valuationDate: Date;
  settlementDate: Date;
}

export function discountFactor(usdRate: Decimal, valuationDate: Date, settlementDate: Date): Decimal {
  const d = daysBetween(valuationDate, settlementDate);
  if (d <= 0) return dec(1);
  return dec(1).div(dec(1).plus(usdRate.mul(d).div(360)));
}

export function ndfMtmUsd(i: NdfMtmInput): Decimal {
  const diff =
    i.direction === "sell"
      ? i.contractRate.minus(i.forwardToFixing)
      : i.forwardToFixing.minus(i.contractRate);
  const df = discountFactor(i.usdRate, i.valuationDate, i.settlementDate);
  return i.notionalLocal.mul(diff).mul(df);
}

/** Days until fixing; negative if already fixed. */
export function daysToFixing(valuationDate: Date, fixingDate: Date): number {
  return daysBetween(valuationDate, fixingDate);
}

export { ZERO };
