import { prisma } from "@/lib/db";
import { Decimal, dec, daysBetween } from "@/lib/money";
import type { MarketView } from "@/lib/engine/types";
import { cipForward } from "./cip";

/**
 * Build the engine-facing MarketView from persisted MarketQuotes.
 * Forward resolution per (ccy, date):
 *   1. exact-date forward_outright quote (dealer quotes pinned to fixings)
 *   2. linear interpolation on the tenor curve (1M/3M/6M/12M)
 *   3. CIP from central-bank rates
 */

const TENOR_DAYS: Record<string, number> = { "1W": 7, "1M": 30, "2M": 61, "3M": 91, "6M": 182, "9M": 273, "12M": 365, "1Y": 365 };

export interface LoadedQuote {
  tenor: string;
  value: Decimal;
  quotedAt: Date;
  source: string;
}

export interface MarketViewData extends MarketView {
  asOf: Date;
  /** spot quote metadata for staleness badges */
  spotMeta: Record<string, { source: string; quotedAt: Date }>;
  rates: Record<string, Decimal>;
}

export async function loadMarketView(asOf?: Date, ccys: string[] = ["PEN", "COP", "MXN", "DOP", "BRL"]): Promise<MarketViewData> {
  const now = asOf ?? new Date();

  // Latest quote per (pair, type, tenor) at or before asOf
  const all = await prisma.marketQuote.findMany({
    where: { quotedAt: { lte: now } },
    orderBy: { quotedAt: "desc" },
  });

  const latest = new Map<string, (typeof all)[number]>();
  for (const q of all) {
    const key = `${q.pair}|${q.type}|${q.tenor}`;
    if (!latest.has(key)) latest.set(key, q);
  }

  const spot: Record<string, Decimal> = {};
  const spotMeta: Record<string, { source: string; quotedAt: Date }> = {};
  const forwards: Record<string, LoadedQuote[]> = {};
  const rates: Record<string, Decimal> = {};

  for (const q of latest.values()) {
    if (q.type === "spot") {
      const ccy = q.pair.split("/")[0];
      spot[ccy] = dec(q.value.toString());
      spotMeta[ccy] = { source: q.source, quotedAt: q.quotedAt };
    } else if (q.type === "forward_outright") {
      const ccy = q.pair.split("/")[0];
      (forwards[ccy] ??= []).push({ tenor: q.tenor, value: dec(q.value.toString()), quotedAt: q.quotedAt, source: q.source });
    } else if (q.type === "interest_rate") {
      rates[q.pair] = dec(q.value.toString());
    }
  }

  const usdRate = rates["USD"] ?? dec("0.043");

  function tenorToDays(tenor: string): number | null {
    if (TENOR_DAYS[tenor] !== undefined) return TENOR_DAYS[tenor];
    if (/^\d{4}-\d{2}-\d{2}$/.test(tenor)) return daysBetween(now, new Date(tenor + "T00:00:00Z"));
    return null;
  }

  function forwardTo(ccy: string, date: Date): Decimal | undefined {
    if (!ccys.includes(ccy)) return undefined;
    const iso = date.toISOString().slice(0, 10);
    const curve = forwards[ccy] ?? [];

    const exact = curve.find((f) => f.tenor === iso);
    if (exact) return exact.value;

    // interpolate on the tenor curve, anchored at spot (day 0)
    const target = daysBetween(now, date);
    const pts: { d: number; v: Decimal }[] = [];
    if (spot[ccy]) pts.push({ d: 0, v: spot[ccy] });
    for (const f of curve) {
      const d = tenorToDays(f.tenor);
      if (d !== null && d >= 0) pts.push({ d, v: f.value });
    }
    pts.sort((a, b) => a.d - b.d);
    if (pts.length >= 2 && target >= 0 && target <= pts[pts.length - 1].d) {
      for (let i = 1; i < pts.length; i++) {
        if (target <= pts[i].d) {
          const [lo, hi] = [pts[i - 1], pts[i]];
          if (hi.d === lo.d) return hi.v;
          const w = dec(target - lo.d).div(hi.d - lo.d);
          return lo.v.plus(hi.v.minus(lo.v).mul(w));
        }
      }
    }

    // CIP fallback
    const s = spot[ccy];
    const rLocal = rates[ccy];
    if (s && rLocal && target > 0) return cipForward(s, rLocal, usdRate, target);
    return s; // last resort: flat at spot
  }

  return { asOf: now, spot, spotMeta, forwardTo, usdRate, rates };
}
