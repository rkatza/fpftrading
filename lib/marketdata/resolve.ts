import { Decimal } from "@/lib/money";
import type { ProviderQuote, RateProvider } from "./types";

/**
 * Resolution order for a market datum (CLAUDE.md):
 *   fresh manual quote → primary API → fallback API → CIP-derived → last-good cache
 * Every result carries source + quotedAt so the UI can show staleness.
 */

export interface ResolveDeps {
  /** latest manual quote for the datum, if any */
  getManual(): Promise<ProviderQuote | null>;
  providers: RateProvider[]; // in priority order: [primary, fallback]
  /** CIP-derived value, if computable */
  getCipDerived(): Promise<ProviderQuote | null>;
  /** last good persisted value of any source */
  getLastGood(): Promise<ProviderQuote | null>;
  /** manual quotes fresher than this many hours win over APIs */
  manualFreshHours?: number;
  now?: Date;
}

export async function resolveSpot(pair: string, deps: ResolveDeps): Promise<ProviderQuote | null> {
  const now = deps.now ?? new Date();
  const freshMs = (deps.manualFreshHours ?? 24) * 3_600_000;

  const manual = await deps.getManual();
  if (manual && now.getTime() - manual.quotedAt.getTime() < freshMs) return manual;

  for (const provider of deps.providers) {
    try {
      const q = await provider.getSpot(pair);
      if (q && q.value.gt(0)) return q;
    } catch {
      // provider outage — fall through to the next source
    }
  }

  const cip = await deps.getCipDerived();
  if (cip) return cip;

  return deps.getLastGood();
}

export interface StalenessInfo {
  quotedAt: Date;
  source: string;
  ageHours: number;
  stale: boolean; // older than threshold for its type
}

export function staleness(quotedAt: Date, source: string, now = new Date(), thresholdHours = 24): StalenessInfo {
  const ageHours = (now.getTime() - quotedAt.getTime()) / 3_600_000;
  return { quotedAt, source, ageHours, stale: ageHours > thresholdHours };
}

export { Decimal };
