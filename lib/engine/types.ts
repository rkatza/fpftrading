import { Decimal } from "@/lib/money";

/**
 * Engine-layer plain-data types. Engines are pure: no I/O, no Prisma.
 * Callers map DB rows into these shapes.
 *
 * Quote convention: every pair "XXX/USD" is quoted as USD per 1 XXX
 * (e.g. PEN/USD ≈ 0.28). Notional is in the local (base) currency.
 */

export type Direction = "buy" | "sell";

export interface HedgeInput {
  id: string;
  type: "NDF" | "FORWARD" | "OPTION_CALL" | "OPTION_PUT" | "STRUCTURE";
  /** buy|sell of the base (local) currency */
  direction: Direction;
  pair: string; // "PEN/USD"
  notionalLocal: Decimal;
  contractRate: Decimal; // USD per local unit
  premiumUsd?: Decimal | null;
  strike2?: Decimal | null;
  fixingDate: Date;
  settlementDate: Date;
  status: "open" | "fixed" | "settled";
}

export interface PositionInput {
  id: string;
  borrower: string;
  marketValueUsd: Decimal;
  underlyingCcy: string;
  exposureFactor: Decimal; // 0–1
  status: "active" | "repaid";
}

export interface CashInput {
  id: string;
  ccy: string;
  amount: Decimal; // in ccy units
}

/** Market snapshot the engines consume. */
export interface MarketView {
  /** USD per local unit, keyed by ccy code (e.g. PEN → 0.284). */
  spot: Record<string, Decimal>;
  /**
   * Forward outright (USD per local unit) for a ccy at a given date.
   * Returns undefined when no curve data exists.
   */
  forwardTo(ccy: string, date: Date): Decimal | undefined;
  /** Annualized USD discount rate (SOFR), decimal e.g. 0.043. */
  usdRate: Decimal;
}

export const baseCcy = (pair: string): string => pair.split("/")[0];
