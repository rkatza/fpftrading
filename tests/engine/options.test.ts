import { describe, expect, it } from "vitest";
import { dec } from "@/lib/money";
import { collarLegs, gkPrice, legPayoffAt, normCdf, payoffDiagram, seagullLegs, smileVol } from "@/lib/engine/options";

describe("Garman–Kohlhagen", () => {
  it("reduces to Black–Scholes when foreign rate is 0 (known value)", () => {
    // BS: S=100, K=100, r=5%, σ=20%, T=1 → call = 10.4506
    const c = gkPrice({
      kind: "call",
      spot: dec(100),
      strike: dec(100),
      usdRate: dec("0.05"),
      localRate: dec(0),
      vol: dec("0.20"),
      timeYears: dec(1),
    });
    expect(c.toNumber()).toBeCloseTo(10.4506, 3);
  });

  it("satisfies put-call parity: c − p = S·e^{-rf·T} − K·e^{-rd·T}", () => {
    const base = {
      spot: dec("0.284"),
      strike: dec("0.29"),
      usdRate: dec("0.043"),
      localRate: dec("0.0475"),
      vol: dec("0.075"),
      timeYears: dec("0.25"),
    };
    const c = gkPrice({ ...base, kind: "call" }).toNumber();
    const p = gkPrice({ ...base, kind: "put" }).toNumber();
    const lhs = c - p;
    const rhs = 0.284 * Math.exp(-0.0475 * 0.25) - 0.29 * Math.exp(-0.043 * 0.25);
    expect(lhs).toBeCloseTo(rhs, 10);
  });

  it("returns intrinsic value at expiry", () => {
    const c = gkPrice({
      kind: "put",
      spot: dec("0.27"),
      strike: dec("0.29"),
      usdRate: dec("0.043"),
      localRate: dec("0.0475"),
      vol: dec("0.075"),
      timeYears: dec(0),
    });
    expect(c.toNumber()).toBeCloseTo(0.02, 10);
  });

  it("normal CDF sanity", () => {
    expect(normCdf(0)).toBe(0.5);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("smile (Malz)", () => {
  const atm = dec("0.075");
  const rr = dec("-0.012");
  const bf = dec("0.0035");

  it("ATM recovers at 50d", () => {
    expect(smileVol(atm, rr, bf, 0.5).toNumber()).toBeCloseTo(0.075, 10);
  });

  it("25d call and put recover RR and BF identities", () => {
    const volCall = smileVol(atm, rr, bf, 0.25);
    const volPut = smileVol(atm, rr, bf, 0.75); // 25d put = 75d call
    // RR = vol25dCall − vol25dPut
    expect(volCall.minus(volPut).toNumber()).toBeCloseTo(-0.012, 10);
    // BF = (vol25dCall + vol25dPut)/2 − ATM
    expect(volCall.plus(volPut).div(2).minus(atm).toNumber()).toBeCloseTo(0.0035, 10);
  });
});

describe("structures & payoff", () => {
  it("collar caps and floors a long-local hedger", () => {
    const legs = collarLegs(dec("0.27"), dec("0.30"), dec("0.002"), dec("0.002"));
    // below the floor: put pays
    expect(legPayoffAt(legs[0], dec("0.25")).toNumber()).toBeCloseTo(0.018, 10);
    // above the cap: short call loses
    expect(legPayoffAt(legs[1], dec("0.32")).toNumber()).toBeCloseTo(-0.018, 10);
    // inside the band: only net premium
    const inside = legs.reduce((a, l) => a + legPayoffAt(l, dec("0.285")).toNumber(), 0);
    expect(inside).toBeCloseTo(0, 10);
  });

  it("seagull has three legs with the expected signs", () => {
    const legs = seagullLegs(dec("0.26"), dec("0.275"), dec("0.295"), {
      lowPut: dec("0.001"),
      put: dec("0.003"),
      call: dec("0.002"),
    });
    expect(legs.map((l) => l.position)).toEqual([-1, 1, -1]);
  });

  it("payoff diagram spans the range with USD scaling", () => {
    const legs = collarLegs(dec("0.27"), dec("0.30"), dec("0.002"), dec("0.002"));
    const pts = payoffDiagram(legs, dec("0.284"), dec("1000000"), 0.15, 10);
    expect(pts).toHaveLength(11);
    expect(Number(pts[0].spot)).toBeCloseTo(0.284 * 0.85, 6);
    expect(Number(pts[10].spot)).toBeCloseTo(0.284 * 1.15, 6);
    // payoffUsd = perUnit × notional
    expect(Number(pts[0].payoffUsd)).toBeCloseTo(Number(pts[0].payoffPerUnit) * 1_000_000, 2);
  });
});
