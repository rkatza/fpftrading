import { Decimal, dec } from "@/lib/money";

/**
 * Garman–Kohlhagen FX option pricing.
 *
 * Convention: S and K in USD per 1 local unit (pair "XXX/USD").
 * rd = USD (domestic/quote ccy) rate, rf = local (foreign/base ccy) rate,
 * continuous compounding, T in years (act/365).
 *
 * The normal CDF uses a float kernel (Hart/Cody-class accuracy ~1e-15);
 * inputs and money results stay Decimal at the boundaries.
 */

export interface GkInput {
  kind: "call" | "put"; // call = right to buy local ccy at K (USD per unit)
  spot: Decimal;
  strike: Decimal;
  usdRate: Decimal; // rd
  localRate: Decimal; // rf
  vol: Decimal; // annualized, e.g. 0.075
  timeYears: Decimal;
}

/** Abramowitz & Stegun 26.2.17-based normal CDF (double precision). */
export function normCdf(x: number): number {
  if (x === 0) return 0.5;
  const neg = x < 0;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * ax);
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * ax * ax) / Math.sqrt(2 * Math.PI);
  const p = 1 - pdf * poly;
  return neg ? 1 - p : p;
}

/** Premium per 1 unit of local notional, in USD. */
export function gkPrice(i: GkInput): Decimal {
  const S = i.spot.toNumber();
  const K = i.strike.toNumber();
  const rd = i.usdRate.toNumber();
  const rf = i.localRate.toNumber();
  const v = i.vol.toNumber();
  const T = i.timeYears.toNumber();

  if (T <= 0 || v <= 0) {
    // intrinsic at expiry
    const intrinsic = i.kind === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return dec(intrinsic.toFixed(12));
  }

  const sqT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (rd - rf + (v * v) / 2) * T) / (v * sqT);
  const d2 = d1 - v * sqT;
  const dfd = Math.exp(-rd * T);
  const dff = Math.exp(-rf * T);

  const price =
    i.kind === "call"
      ? S * dff * normCdf(d1) - K * dfd * normCdf(d2)
      : K * dfd * normCdf(-d2) - S * dff * normCdf(-d1);
  return dec(price.toFixed(12));
}

/** Forward delta of the option (local-ccy call delta in [0,1]). */
export function gkDelta(i: GkInput): number {
  const S = i.spot.toNumber();
  const K = i.strike.toNumber();
  const v = i.vol.toNumber();
  const T = i.timeYears.toNumber();
  const rd = i.usdRate.toNumber();
  const rf = i.localRate.toNumber();
  if (T <= 0 || v <= 0) return i.kind === "call" ? (S > K ? 1 : 0) : S < K ? -1 : 0;
  const d1 = (Math.log(S / K) + (rd - rf + (v * v) / 2) * T) / (v * Math.sqrt(T));
  const dff = Math.exp(-rf * T);
  return i.kind === "call" ? dff * normCdf(d1) : -dff * normCdf(-d1);
}

/**
 * Malz quadratic smile from ATM / 25d risk-reversal / 25d butterfly:
 *   σ(δc) = ATM − 2·RR·(δc − 0.5) + 16·BF·(δc − 0.5)²
 * where δc is the call delta in (0,1).
 */
export function smileVol(atm: Decimal, rr25: Decimal, bf25: Decimal, callDelta: number): Decimal {
  const x = dec(callDelta).minus("0.5");
  return atm.minus(rr25.mul(2).mul(x)).plus(bf25.mul(16).mul(x.pow(2)));
}

// --- Structures & payoff diagrams ---

export interface OptionLeg {
  kind: "call" | "put" | "forward";
  /** +1 long, −1 short (of the local ccy for forwards; of the option otherwise) */
  position: 1 | -1;
  strike: Decimal; // contract rate for forwards
  /** premium per unit local notional, USD (0 for forwards) */
  premium: Decimal;
}

/** Collar for a long-local-ccy hedger: buy put (floor), sell call (cap). */
export function collarLegs(putStrike: Decimal, callStrike: Decimal, putPremium: Decimal, callPremium: Decimal): OptionLeg[] {
  return [
    { kind: "put", position: 1, strike: putStrike, premium: putPremium },
    { kind: "call", position: -1, strike: callStrike, premium: callPremium },
  ];
}

/** Seagull: collar financed by selling a further-OTM put (k1 < k2 < k3). */
export function seagullLegs(
  lowPutStrike: Decimal,
  putStrike: Decimal,
  callStrike: Decimal,
  premiums: { lowPut: Decimal; put: Decimal; call: Decimal }
): OptionLeg[] {
  return [
    { kind: "put", position: -1, strike: lowPutStrike, premium: premiums.lowPut },
    { kind: "put", position: 1, strike: putStrike, premium: premiums.put },
    { kind: "call", position: -1, strike: callStrike, premium: premiums.call },
  ];
}

export function legPayoffAt(leg: OptionLeg, spotAtExpiry: Decimal): Decimal {
  let intrinsic: Decimal;
  if (leg.kind === "forward") {
    intrinsic = spotAtExpiry.minus(leg.strike); // long local fwd payoff
  } else if (leg.kind === "call") {
    intrinsic = Decimal.max(spotAtExpiry.minus(leg.strike), 0);
  } else {
    intrinsic = Decimal.max(leg.strike.minus(spotAtExpiry), 0);
  }
  return intrinsic.mul(leg.position).minus(leg.premium.mul(leg.position));
}

export interface PayoffPoint {
  spot: string;
  payoffPerUnit: string;
  payoffUsd: string;
}

/** Payoff diagram data across ±range% of spot, per unit and on full notional. */
export function payoffDiagram(
  legs: OptionLeg[],
  spot: Decimal,
  notionalLocal: Decimal,
  rangePct = 0.15,
  steps = 60
): PayoffPoint[] {
  const lo = spot.mul(1 - rangePct);
  const hi = spot.mul(1 + rangePct);
  const step = hi.minus(lo).div(steps);
  const points: PayoffPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = lo.plus(step.mul(i));
    const perUnit = legs.reduce((acc, leg) => acc.plus(legPayoffAt(leg, s)), dec(0));
    points.push({
      spot: s.toFixed(8),
      payoffPerUnit: perUnit.toFixed(8),
      payoffUsd: perUnit.mul(notionalLocal).toFixed(2),
    });
  }
  return points;
}
