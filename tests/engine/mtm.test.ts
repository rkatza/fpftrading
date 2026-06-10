import { describe, expect, it } from "vitest";
import { dec } from "@/lib/money";
import { discountFactor, ndfMtmUsd } from "@/lib/engine/mtm";

/**
 * Regression targets: the 3 short PEN/USD NDFs at Goldman, Apr 30 2026
 * statement MTMs +$18,881 / +$26,063 / +$22,915 (CLAUDE.md). Engine must
 * reproduce each within $1 given the seeded forwards and SOFR 4.30%.
 */
const VAL_DATE = new Date("2026-04-30T00:00:00Z");
const SOFR = dec("0.0430");

const GS_BOOK = [
  {
    notional: "1828329.00",
    contractRate: "0.29488859",
    forward: "0.28450000",
    settlement: "2026-06-19",
    target: 18881,
  },
  {
    notional: "2914395.00",
    contractRate: "0.29565114",
    forward: "0.28650000",
    settlement: "2026-11-11",
    target: 26063,
  },
  {
    notional: "1837471.00",
    contractRate: "0.29682159",
    forward: "0.28430000",
    settlement: "2026-06-03",
    target: 22915,
  },
];

describe("NDF MTM — Goldman book regression", () => {
  it.each(GS_BOOK)("reproduces $target within $1", (h) => {
    const mtm = ndfMtmUsd({
      direction: "sell",
      notionalLocal: dec(h.notional),
      contractRate: dec(h.contractRate),
      forwardToFixing: dec(h.forward),
      usdRate: SOFR,
      valuationDate: VAL_DATE,
      settlementDate: new Date(h.settlement + "T00:00:00Z"),
    });
    expect(Math.abs(mtm.toNumber() - h.target)).toBeLessThanOrEqual(1);
  });

  it("total book MTM ≈ $67,859", () => {
    const total = GS_BOOK.reduce(
      (acc, h) =>
        acc.plus(
          ndfMtmUsd({
            direction: "sell",
            notionalLocal: dec(h.notional),
            contractRate: dec(h.contractRate),
            forwardToFixing: dec(h.forward),
            usdRate: SOFR,
            valuationDate: VAL_DATE,
            settlementDate: new Date(h.settlement + "T00:00:00Z"),
          })
        ),
      dec(0)
    );
    expect(Math.abs(total.toNumber() - 67859)).toBeLessThanOrEqual(3);
  });
});

describe("NDF MTM — conventions", () => {
  it("short local ccy gains when forward falls below contract", () => {
    // CLAUDE.md sanity anchor: K≈0.294 vs F≈0.284, short PEN → positive
    const mtm = ndfMtmUsd({
      direction: "sell",
      notionalLocal: dec("1000000"),
      contractRate: dec("0.294"),
      forwardToFixing: dec("0.284"),
      usdRate: dec("0.043"),
      valuationDate: VAL_DATE,
      settlementDate: new Date("2026-06-19T00:00:00Z"),
    });
    expect(mtm.toNumber()).toBeGreaterThan(0);
  });

  it("buy is the mirror image of sell", () => {
    const args = {
      notionalLocal: dec("1000000"),
      contractRate: dec("0.294"),
      forwardToFixing: dec("0.284"),
      usdRate: dec("0.043"),
      valuationDate: VAL_DATE,
      settlementDate: new Date("2026-06-19T00:00:00Z"),
    };
    const short = ndfMtmUsd({ ...args, direction: "sell" });
    const long = ndfMtmUsd({ ...args, direction: "buy" });
    expect(long.plus(short).toNumber()).toBeCloseTo(0, 10);
  });

  it("discount factor: 50 days at 4.30% act/360", () => {
    const df = discountFactor(SOFR, VAL_DATE, new Date("2026-06-19T00:00:00Z"));
    // 1 / (1 + 0.043 × 50/360) = 0.99406324…
    expect(df.toNumber()).toBeCloseTo(0.99406324, 7);
  });

  it("no discounting at or past settlement", () => {
    expect(discountFactor(SOFR, VAL_DATE, VAL_DATE).toNumber()).toBe(1);
  });
});
