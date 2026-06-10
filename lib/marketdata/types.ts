import { Decimal } from "@/lib/money";

/**
 * Provider layer. All HTTP lives here — components and engines never call
 * providers directly. Quotes are normalized to the fund convention before
 * persisting: pair "XXX/USD" = USD per 1 XXX.
 */

export interface ProviderQuote {
  pair: string; // fund convention, e.g. "PEN/USD"
  tenor: string; // "SPOT" | "1M" | ISO date
  value: Decimal;
  source: string; // "api:twelvedata" | "api:tradermade" | "manual" | "cip" | "central_bank"
  quotedAt: Date;
}

export interface HistoryPoint {
  date: string; // ISO date
  value: Decimal;
}

export interface RateProvider {
  readonly name: string;
  getSpot(pair: string): Promise<ProviderQuote | null>;
  getHistory(pair: string, days: number): Promise<HistoryPoint[]>;
  getForward?(pair: string, tenor: string): Promise<ProviderQuote | null>;
}

export const TRACKED_PAIRS = ["PEN/USD", "COP/USD", "MXN/USD", "DOP/USD", "BRL/USD"] as const;

/** "PEN/USD" (fund) ↔ "USD/PEN" (provider-native, local per USD). */
export function toProviderSymbol(pair: string): string {
  const [base, quote] = pair.split("/");
  return `${quote}/${base}`;
}

export class ProviderError extends Error {
  constructor(provider: string, message: string) {
    super(`[${provider}] ${message}`);
  }
}
