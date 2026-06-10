import { describe, expect, it } from "vitest";
import { dec } from "@/lib/money";
import { cipDeviation, cipForward } from "@/lib/marketdata/cip";

describe("CIP forward", () => {
  it("hand-computed example: PEN 90d", () => {
    // S = 0.284 USD/PEN, r_PEN = 4.75%, r_USD = 4.30%, 90 days
    // F = 0.284 × (1 + 0.043×0.25) / (1 + 0.0475×0.25)
    //   = 0.284 × 1.01075 / 1.011875 = 0.28368421…
    const f = cipForward(dec("0.284"), dec("0.0475"), dec("0.043"), 90);
    expect(f.toNumber()).toBeCloseTo(0.28368421, 7);
  });

  it("higher local rate ⇒ forward discount in USD-per-local terms", () => {
    const f = cipForward(dec("0.000238"), dec("0.0925"), dec("0.043"), 180);
    expect(f.toNumber()).toBeLessThan(0.000238);
  });

  it("equal rates ⇒ forward = spot", () => {
    const f = cipForward(dec("0.284"), dec("0.043"), dec("0.043"), 365);
    expect(f.toNumber()).toBeCloseTo(0.284, 12);
  });

  it("deviation: ±10% sanity band math", () => {
    expect(cipDeviation(dec("0.31"), dec("0.284")).toNumber()).toBeCloseTo(0.0915, 3);
    expect(cipDeviation(dec("0.284"), dec("0.284")).isZero()).toBe(true);
  });
});
