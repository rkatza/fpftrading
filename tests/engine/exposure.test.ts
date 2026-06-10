import { describe, expect, it } from "vitest";
import { dec, Decimal } from "@/lib/money";
import { computeExposures } from "@/lib/engine/exposure";
import type { CashInput, HedgeInput, MarketView, PositionInput } from "@/lib/engine/types";

const VAL_DATE = new Date("2026-04-30T00:00:00Z");

const market: MarketView = {
  spot: { PEN: dec("0.284"), COP: dec("0.000238") },
  usdRate: dec("0.043"),
  forwardTo: (ccy: string) => (ccy === "PEN" ? dec("0.2845") : undefined),
};

const positions: PositionInput[] = [
  { id: "p1", borrower: "Lima Bikes", marketValueUsd: dec("1876042"), underlyingCcy: "PEN", exposureFactor: dec("1"), status: "active" },
  { id: "p2", borrower: "Welli", marketValueUsd: dec("2000000"), underlyingCcy: "COP", exposureFactor: dec("0.5"), status: "active" },
  { id: "p3", borrower: "Repaid Co", marketValueUsd: dec("999999"), underlyingCcy: "PEN", exposureFactor: dec("1"), status: "repaid" },
  { id: "p4", borrower: "Paycaddy", marketValueUsd: dec("425000"), underlyingCcy: "USD", exposureFactor: dec("0"), status: "active" },
];

const cash: CashInput[] = [
  { id: "c1", ccy: "USD", amount: dec("4000000") }, // USD cash is not FX exposure
  { id: "c2", ccy: "PEN", amount: dec("100000") }, // PEN 100k ≈ $28,400
];

const hedges: HedgeInput[] = [
  {
    id: "h1",
    type: "NDF",
    direction: "sell",
    pair: "PEN/USD",
    notionalLocal: dec("1828329"),
    contractRate: dec("0.29488859"),
    fixingDate: new Date("2026-06-17T00:00:00Z"),
    settlementDate: new Date("2026-06-19T00:00:00Z"),
    status: "open",
  },
];

describe("exposure engine", () => {
  const result = computeExposures(positions, cash, hedges, market, VAL_DATE);
  const pen = result.find((e) => e.ccy === "PEN")!;
  const cop = result.find((e) => e.ccy === "COP")!;

  it("gross = active positions × factor + local-ccy cash at spot", () => {
    // 1,876,042 + 100,000 × 0.284 = 1,904,442 (repaid position excluded)
    expect(pen.grossExposureUsd.toFixed(2)).toBe("1904442.00");
    // 2,000,000 × 0.5
    expect(cop.grossExposureUsd.toFixed(2)).toBe("1000000.00");
  });

  it("hedge notional at current forward, sell = coverage", () => {
    // 1,828,329 × 0.2845
    expect(pen.hedgeNotionalUsd.toFixed(2)).toBe("520159.60");
  });

  it("net and ratio", () => {
    expect(pen.netExposureUsd.toFixed(2)).toBe(pen.grossExposureUsd.minus(pen.hedgeNotionalUsd).toFixed(2));
    expect(pen.hedgeRatio!.toNumber()).toBeCloseTo(520159.6 / 1904442, 6);
  });

  it("unhedged ccy has zero coverage and null ratio only when gross is zero", () => {
    expect(cop.hedgeNotionalUsd.isZero()).toBe(true);
    expect(cop.hedgeRatio!.isZero()).toBe(true);
    const dop = result.find((e) => e.ccy === "DOP")!;
    expect(dop.hedgeRatio).toBeNull();
  });

  it("a buy hedge reduces coverage", () => {
    const withBuy = computeExposures(
      positions,
      cash,
      [...hedges, { ...hedges[0], id: "h2", direction: "buy" as const }],
      market,
      VAL_DATE
    );
    const penWithBuy = withBuy.find((e) => e.ccy === "PEN")!;
    expect(penWithBuy.hedgeNotionalUsd.toFixed(2)).toBe("0.00");
  });

  it("hedge MTM rolls up per ccy", () => {
    expect(pen.hedgeMtmUsd.toNumber()).toBeGreaterThan(0);
    expect(pen.hedgeMtmUsd).toBeInstanceOf(Decimal);
  });
});
