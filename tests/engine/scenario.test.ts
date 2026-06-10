import { describe, expect, it } from "vitest";
import { dec } from "@/lib/money";
import { runScenario, shockMarket } from "@/lib/engine/scenario";
import { annualizedCarry } from "@/lib/engine/carry";
import { DEFAULT_MARGIN_CONFIG, estimateMargin, marginShortfall } from "@/lib/engine/margin";
import { generateAlerts } from "@/lib/engine/alerts";
import type { HedgeInput, MarketView, PositionInput } from "@/lib/engine/types";

const VAL_DATE = new Date("2026-04-30T00:00:00Z");

const market: MarketView = {
  spot: { PEN: dec("0.284") },
  usdRate: dec("0.043"),
  forwardTo: (ccy: string) => (ccy === "PEN" ? dec("0.2845") : undefined),
};

const hedge: HedgeInput = {
  id: "h1",
  type: "NDF",
  direction: "sell",
  pair: "PEN/USD",
  notionalLocal: dec("1828329"),
  contractRate: dec("0.29488859"),
  fixingDate: new Date("2026-06-17T00:00:00Z"),
  settlementDate: new Date("2026-06-19T00:00:00Z"),
  status: "open",
};

const positions: PositionInput[] = [
  { id: "p1", borrower: "Lima Bikes", marketValueUsd: dec("1876042"), underlyingCcy: "PEN", exposureFactor: dec("1"), status: "active" },
];

describe("scenario engine", () => {
  it("spot shock scales spot and forwards", () => {
    const shocked = shockMarket(market, { spotPct: dec("-0.10"), fwdPointsBps: dec(0), volPts: dec(0) });
    expect(shocked.spot.PEN.toNumber()).toBeCloseTo(0.2556, 10);
    expect(shocked.forwardTo("PEN", new Date("2026-06-17T00:00:00Z"))!.toNumber()).toBeCloseTo(0.25605, 10);
  });

  it("ccy-scoped shock leaves other ccys alone", () => {
    const m: MarketView = { ...market, spot: { PEN: dec("0.284"), COP: dec("0.000238") } };
    const shocked = shockMarket(m, { spotPct: dec("-0.10"), fwdPointsBps: dec(0), volPts: dec(0), ccy: "COP" });
    expect(shocked.spot.PEN.toNumber()).toBe(0.284);
    expect(shocked.spot.COP.toNumber()).toBeCloseTo(0.0002142, 12);
  });

  it("PEN −10%: short hedge gains, unhedged exposure loses, net is partial", () => {
    const res = runScenario(positions, [], [hedge], market, VAL_DATE, { spotPct: dec("-0.10"), fwdPointsBps: dec(0), volPts: dec(0), ccy: "PEN" }, DEFAULT_MARGIN_CONFIG);
    // hedge gain ≈ N × F × 10% × DF ≈ 1,828,329 × 0.02845 × 0.994 ≈ +51,710
    expect(res.hedgeMtmDeltaUsd.toNumber()).toBeGreaterThan(45000);
    // exposure loss = 1,876,042 × −10%
    expect(res.exposureDeltaUsd.toNumber()).toBeCloseTo(-187604.2, 1);
    // partially hedged → net loss between the two
    expect(res.netPnlUsd.toNumber()).toBeLessThan(0);
    expect(res.netPnlUsd.toNumber()).toBeGreaterThan(res.exposureDeltaUsd.toNumber());
  });
});

describe("carry calculator", () => {
  it("hand-computed example: F=0.2845, S=0.284, 91 days", () => {
    // (0.2845−0.284)/0.284 × 365/91 = 0.00176056… × 4.010989 = 0.0070614…
    const c = annualizedCarry(dec("0.284"), dec("0.2845"), 91);
    expect(c.toNumber()).toBeCloseTo(0.0070614, 6);
  });

  it("zero days → zero carry", () => {
    expect(annualizedCarry(dec("0.284"), dec("0.2845"), 0).isZero()).toBe(true);
  });
});

describe("margin estimator", () => {
  it("required = Σ notional×fwd × weight × (1 − netting)", () => {
    const est = estimateMargin([hedge], market, { weights: {}, defaultWeight: dec("0.06"), nettingBenefit: dec("0.10") });
    // 1,828,329 × 0.2845 = 520,159.60 → ×0.06×0.9 = 28,088.62
    expect(est.grossNotionalUsd.toFixed(2)).toBe("520159.60");
    expect(est.requiredUsd.toFixed(2)).toBe("28088.62");
  });

  it("shortfall sign convention", () => {
    expect(marginShortfall(dec("100"), dec("150")).toNumber()).toBe(50);
    expect(marginShortfall(dec("200"), dec("150")).toNumber()).toBe(-50);
  });
});

describe("alert generator", () => {
  it("flags fixings ≤30d, band breaches, big spot moves, margin shortfalls", () => {
    const alerts = generateAlerts({
      valuationDate: new Date("2026-05-20T00:00:00Z"), // 28 days to 06/17 fixing
      hedges: [hedge],
      exposures: [
        {
          ccy: "PEN",
          positionExposureUsd: dec("1876042"),
          cashUsd: dec(0),
          grossExposureUsd: dec("1876042"),
          hedgeNotionalUsd: dec("520159"),
          netExposureUsd: dec("1355883"),
          hedgeRatio: dec("0.277"),
          hedgeMtmUsd: dec("18881"),
          openHedgeCount: 1,
        },
      ],
      policies: [{ ccy: "PEN", min: dec("0.5"), max: dec("1.0") }],
      spotMoves: { PEN: dec("-0.018"), COP: dec("0.001") },
      margin: [{ counterparty: "Goldman Sachs", postedUsd: dec("20000"), requiredUsd: dec("28088") }],
    });

    const types = alerts.map((a) => a.type).sort();
    expect(types).toEqual(["fixing_soon", "margin_shortfall", "ratio_out_of_band", "spot_move"]);
    expect(alerts.find((a) => a.type === "spot_move")!.severity).toBe("warning");
  });
});
