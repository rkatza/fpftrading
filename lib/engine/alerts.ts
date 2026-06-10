import { Decimal } from "@/lib/money";
import { daysToFixing } from "./mtm";
import type { CcyExposure } from "./exposure";
import { baseCcy, type HedgeInput } from "./types";

export interface AlertCandidate {
  type: "fixing_soon" | "ratio_out_of_band" | "spot_move" | "margin_shortfall";
  severity: "info" | "warning" | "critical";
  message: string;
  ccy?: string;
  hedgeId?: string;
}

export interface PolicyBand {
  ccy: string;
  min: Decimal;
  max: Decimal;
}

export function generateAlerts(args: {
  valuationDate: Date;
  hedges: HedgeInput[];
  exposures: CcyExposure[];
  policies: PolicyBand[];
  /** spot move day/day per ccy, e.g. PEN → -0.018 = −1.8% */
  spotMoves: Record<string, Decimal>;
  margin: { postedUsd: Decimal; requiredUsd: Decimal; counterparty: string }[];
}): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];

  for (const h of args.hedges) {
    if (h.status !== "open") continue;
    const d = daysToFixing(args.valuationDate, h.fixingDate);
    if (d >= 0 && d <= 30) {
      alerts.push({
        type: "fixing_soon",
        severity: d <= 7 ? "critical" : "warning",
        message: `${h.pair} ${h.type} (${h.notionalLocal.toFixed(0)} local) fixes in ${d} day${d === 1 ? "" : "s"}`,
        ccy: baseCcy(h.pair),
        hedgeId: h.id,
      });
    }
  }

  for (const pol of args.policies) {
    const exp = args.exposures.find((e) => e.ccy === pol.ccy);
    if (!exp || exp.hedgeRatio === null) continue;
    if (exp.hedgeRatio.lt(pol.min) || exp.hedgeRatio.gt(pol.max)) {
      alerts.push({
        type: "ratio_out_of_band",
        severity: "warning",
        message: `${pol.ccy} hedge ratio ${exp.hedgeRatio.mul(100).toFixed(1)}% outside target band ${pol.min.mul(100).toFixed(0)}–${pol.max.mul(100).toFixed(0)}%`,
        ccy: pol.ccy,
      });
    }
  }

  for (const [ccy, move] of Object.entries(args.spotMoves)) {
    if (move.abs().gt("0.015")) {
      alerts.push({
        type: "spot_move",
        severity: move.abs().gt("0.03") ? "critical" : "warning",
        message: `${ccy} moved ${move.mul(100).toFixed(2)}% day/day`,
        ccy,
      });
    }
  }

  for (const m of args.margin) {
    if (m.requiredUsd.gt(m.postedUsd)) {
      alerts.push({
        type: "margin_shortfall",
        severity: "critical",
        message: `Margin shortfall at ${m.counterparty}: posted $${m.postedUsd.toFixed(0)} < required $${m.requiredUsd.toFixed(0)}`,
      });
    }
  }

  return alerts;
}
