import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dec } from "@/lib/money";
import { prisma } from "@/lib/db";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { collarLegs, gkPrice, payoffDiagram, seagullLegs, type OptionLeg } from "@/lib/engine/options";
import { annualizedCarry } from "@/lib/engine/carry";

const schema = z.object({
  ccy: z.string().length(3),
  structure: z.enum(["forward", "put", "collar", "seagull"]),
  notionalLocal: z.coerce.number().positive(),
  tenorDays: z.coerce.number().int().min(7).max(730),
  putStrike: z.coerce.number().positive().optional(),
  callStrike: z.coerce.number().positive().optional(),
  lowPutStrike: z.coerce.number().positive().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const p = parsed.data;

  const market = await loadMarketView();
  const spot = market.spot[p.ccy];
  if (!spot) return NextResponse.json({ error: `No spot for ${p.ccy}` }, { status: 400 });

  const expiry = new Date(Date.now() + p.tenorDays * 86_400_000);
  const fwd = market.forwardTo(p.ccy, expiry) ?? spot;
  const localRate = market.rates[p.ccy] ?? dec("0.05");
  const T = dec(p.tenorDays).div(365);

  // latest ATM vol for the ccy (any tenor; manual entry is first-class)
  const volQuote = await prisma.marketQuote.findFirst({
    where: { pair: `${p.ccy}/USD`, type: "vol_atm" },
    orderBy: { quotedAt: "desc" },
  });
  const vol = volQuote ? dec(volQuote.value.toString()) : dec("0.10");

  const price = (kind: "call" | "put", strike: number) =>
    gkPrice({ kind, spot, strike: dec(strike), usdRate: market.usdRate, localRate, vol, timeYears: T });

  const notional = dec(p.notionalLocal);
  let legs: OptionLeg[];
  let premiumUsd = dec(0);

  if (p.structure === "forward") {
    legs = [{ kind: "forward", position: -1, strike: fwd, premium: dec(0) }];
  } else if (p.structure === "put") {
    const k = p.putStrike ?? spot.toNumber();
    const prem = price("put", k);
    premiumUsd = prem.mul(notional).neg();
    legs = [{ kind: "put", position: 1, strike: dec(k), premium: prem }];
  } else if (p.structure === "collar") {
    const kp = p.putStrike ?? spot.mul("0.97").toNumber();
    const kc = p.callStrike ?? spot.mul("1.03").toNumber();
    const pp = price("put", kp);
    const cp = price("call", kc);
    premiumUsd = cp.minus(pp).mul(notional);
    legs = collarLegs(dec(kp), dec(kc), pp, cp);
  } else {
    const klp = p.lowPutStrike ?? spot.mul("0.90").toNumber();
    const kp = p.putStrike ?? spot.mul("0.97").toNumber();
    const kc = p.callStrike ?? spot.mul("1.03").toNumber();
    const lpp = price("put", klp);
    const pp = price("put", kp);
    const cp = price("call", kc);
    premiumUsd = cp.plus(lpp).minus(pp).mul(notional);
    legs = seagullLegs(dec(klp), dec(kp), dec(kc), { lowPut: lpp, put: pp, call: cp });
  }

  const carry = annualizedCarry(spot, fwd, p.tenorDays);

  return NextResponse.json({
    spot: spot.toFixed(8),
    forward: fwd.toFixed(8),
    atmVol: vol.toFixed(4),
    volSource: volQuote ? `${volQuote.source} ${volQuote.tenor}` : "default 10%",
    netPremiumUsd: premiumUsd.toFixed(2), // negative = you pay
    annualizedCarry: carry.toFixed(6),
    strikes: legs.filter((l) => l.kind !== "forward").map((l) => l.strike.toNumber()),
    payoff: payoffDiagram(legs, spot, notional).map((pt) => ({
      spot: Number(pt.spot),
      payoffUsd: Number(pt.payoffUsd),
    })),
  });
}
