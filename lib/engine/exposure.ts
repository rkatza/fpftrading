import { Decimal, dec, ZERO } from "@/lib/money";
import { ndfMtmUsd } from "./mtm";
import { baseCcy, type CashInput, type HedgeInput, type MarketView, type PositionInput } from "./types";

export interface CcyExposure {
  ccy: string;
  /** Σ active position MV × exposureFactor (positions whose underlying is ccy). */
  positionExposureUsd: Decimal;
  /** Cash held in this ccy, converted to USD at spot. */
  cashUsd: Decimal;
  grossExposureUsd: Decimal;
  /** Σ open hedge notional × current forward (sell local = +coverage). */
  hedgeNotionalUsd: Decimal;
  netExposureUsd: Decimal;
  /** hedged / gross; null when gross is 0. */
  hedgeRatio: Decimal | null;
  hedgeMtmUsd: Decimal;
  openHedgeCount: number;
}

export function computeExposures(
  positions: PositionInput[],
  cash: CashInput[],
  hedges: HedgeInput[],
  market: MarketView,
  valuationDate: Date,
  trackedCcys: string[] = ["PEN", "COP", "MXN", "DOP", "BRL"]
): CcyExposure[] {
  return trackedCcys.map((ccy) => {
    let positionExposureUsd = ZERO;
    for (const p of positions) {
      if (p.status !== "active" || p.underlyingCcy !== ccy) continue;
      positionExposureUsd = positionExposureUsd.plus(p.marketValueUsd.mul(p.exposureFactor));
    }

    let cashUsd = ZERO;
    const spot = market.spot[ccy];
    for (const c of cash) {
      if (c.ccy !== ccy) continue;
      if (!spot) continue; // can't convert without a spot — excluded, surfaced by staleness UI
      cashUsd = cashUsd.plus(c.amount.mul(spot));
    }

    const grossExposureUsd = positionExposureUsd.plus(cashUsd);

    let hedgeNotionalUsd = ZERO;
    let hedgeMtmUsd = ZERO;
    let openHedgeCount = 0;
    for (const h of hedges) {
      if (h.status === "settled" || baseCcy(h.pair) !== ccy) continue;
      if (h.type !== "NDF" && h.type !== "FORWARD") continue; // options counted at MTM only (v1)
      const fwd = market.forwardTo(ccy, h.fixingDate) ?? spot;
      if (!fwd) continue;
      const usdEquiv = h.notionalLocal.mul(fwd);
      // selling local ccy forward offsets a long local exposure
      hedgeNotionalUsd = hedgeNotionalUsd.plus(h.direction === "sell" ? usdEquiv : usdEquiv.neg());
      hedgeMtmUsd = hedgeMtmUsd.plus(
        ndfMtmUsd({
          direction: h.direction,
          notionalLocal: h.notionalLocal,
          contractRate: h.contractRate,
          forwardToFixing: fwd,
          usdRate: market.usdRate,
          valuationDate,
          settlementDate: h.settlementDate,
        })
      );
      openHedgeCount++;
    }

    const netExposureUsd = grossExposureUsd.minus(hedgeNotionalUsd);
    const hedgeRatio = grossExposureUsd.isZero() ? null : hedgeNotionalUsd.div(grossExposureUsd);

    return {
      ccy,
      positionExposureUsd,
      cashUsd,
      grossExposureUsd,
      hedgeNotionalUsd,
      netExposureUsd,
      hedgeRatio,
      hedgeMtmUsd,
      openHedgeCount,
    };
  });
}

export function totalHedgeMtm(exposures: CcyExposure[]): Decimal {
  return exposures.reduce((acc, e) => acc.plus(e.hedgeMtmUsd), dec(0));
}
