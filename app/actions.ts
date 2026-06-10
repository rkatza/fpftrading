"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dec, daysBetween } from "@/lib/money";
import { cipForward, cipDeviation } from "@/lib/marketdata/cip";
import { loadMarketView } from "@/lib/marketdata/marketview";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");
  return session.user.email;
}

const decimalStr = z
  .string()
  .trim()
  .refine((s) => s !== "" && !Number.isNaN(Number(s)), "must be a number");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const asDate = (s: string) => new Date(s + "T00:00:00.000Z");

export type ActionResult = { ok: true; warning?: string } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Invalid input" };
}

// --- Positions ---
const positionSchema = z.object({
  id: z.string().optional(),
  borrower: z.string().min(1),
  country: z.string().min(1),
  usdNotional: decimalStr,
  marketValueUsd: decimalStr,
  settlementCcy: z.string().length(3),
  underlyingCcy: z.string().length(3),
  exposureFactor: decimalStr.refine((s) => Number(s) >= 0 && Number(s) <= 1, "0–1"),
  startDate: dateStr,
  maturityDate: dateStr.optional().or(z.literal("")),
  status: z.enum(["active", "repaid"]),
  notes: z.string().optional(),
});

export async function savePosition(form: FormData): Promise<ActionResult> {
  try {
    await requireSession();
    const p = positionSchema.parse(Object.fromEntries(form));
    const data = {
      borrower: p.borrower,
      country: p.country,
      usdNotional: p.usdNotional,
      marketValueUsd: p.marketValueUsd,
      settlementCcy: p.settlementCcy.toUpperCase(),
      underlyingCcy: p.underlyingCcy.toUpperCase(),
      exposureFactor: p.exposureFactor,
      startDate: asDate(p.startDate),
      maturityDate: p.maturityDate ? asDate(p.maturityDate) : null,
      status: p.status,
      notes: p.notes || null,
    };
    if (p.id) await prisma.position.update({ where: { id: p.id }, data });
    else await prisma.position.create({ data });
    revalidatePath("/positions");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePosition(id: string): Promise<ActionResult> {
  try {
    await requireSession();
    await prisma.position.delete({ where: { id } });
    revalidatePath("/positions");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --- Cash ---
const cashSchema = z.object({
  id: z.string().optional(),
  counterpartyId: z.string().min(1),
  account: z.string().min(1),
  ccy: z.string().length(3),
  amount: decimalStr,
  asOf: dateStr,
  isMarginAccount: z.coerce.boolean().default(false),
});

export async function saveCash(form: FormData): Promise<ActionResult> {
  try {
    await requireSession();
    const c = cashSchema.parse(Object.fromEntries(form));
    const data = {
      counterpartyId: c.counterpartyId,
      account: c.account,
      ccy: c.ccy.toUpperCase(),
      amount: c.amount,
      asOf: asDate(c.asOf),
      isMarginAccount: c.isMarginAccount,
    };
    if (c.id) await prisma.cashBalance.update({ where: { id: c.id }, data });
    else await prisma.cashBalance.create({ data });
    revalidatePath("/cash");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCash(id: string): Promise<ActionResult> {
  try {
    await requireSession();
    await prisma.cashBalance.delete({ where: { id } });
    revalidatePath("/cash");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --- Hedges ---
const hedgeSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["NDF", "FORWARD", "OPTION_CALL", "OPTION_PUT", "STRUCTURE"]),
  direction: z.enum(["buy", "sell"]),
  pair: z.string().regex(/^[A-Z]{3}\/[A-Z]{3}$/, "e.g. PEN/USD"),
  notionalLocal: decimalStr,
  contractRate: decimalStr,
  premiumUsd: decimalStr.optional().or(z.literal("")),
  strike2: decimalStr.optional().or(z.literal("")),
  tradeDate: dateStr,
  fixingDate: dateStr,
  settlementDate: dateStr,
  counterpartyId: z.string().min(1),
  status: z.enum(["open", "fixed", "settled"]),
  settledPnlUsd: decimalStr.optional().or(z.literal("")),
  parentHedgeId: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveHedge(form: FormData): Promise<ActionResult> {
  try {
    await requireSession();
    const h = hedgeSchema.parse(Object.fromEntries(form));
    const data = {
      type: h.type,
      direction: h.direction,
      pair: h.pair,
      notionalLocal: h.notionalLocal,
      contractRate: h.contractRate,
      premiumUsd: h.premiumUsd || null,
      strike2: h.strike2 || null,
      tradeDate: asDate(h.tradeDate),
      fixingDate: asDate(h.fixingDate),
      settlementDate: asDate(h.settlementDate),
      counterpartyId: h.counterpartyId,
      status: h.status,
      settledPnlUsd: h.settledPnlUsd || null,
      parentHedgeId: h.parentHedgeId || null,
      notes: h.notes || null,
    };

    // sanity: warn when the contract rate is >10% off the CIP-implied forward
    let warning: string | undefined;
    const ccy = h.pair.split("/")[0];
    const mkt = await loadMarketView();
    const implied = mkt.forwardTo(ccy, asDate(h.fixingDate));
    if (implied) {
      const dev = cipDeviation(dec(h.contractRate), implied);
      if (dev.abs().gt("0.10")) {
        warning = `Contract rate is ${dev.mul(100).toFixed(1)}% off the CIP-implied forward (${implied.toFixed(6)}). Double-check the quote convention.`;
      }
    }

    if (h.id) await prisma.hedge.update({ where: { id: h.id }, data });
    else await prisma.hedge.create({ data });
    revalidatePath("/hedges");
    revalidatePath("/");
    return { ok: true, warning };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHedge(id: string): Promise<ActionResult> {
  try {
    await requireSession();
    await prisma.hedge.delete({ where: { id } });
    revalidatePath("/hedges");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Roll: settle the old hedge and create a pre-filled replacement. */
export async function rollHedge(id: string, form: FormData): Promise<ActionResult> {
  try {
    await requireSession();
    const old = await prisma.hedge.findUniqueOrThrow({ where: { id } });
    const rolled = hedgeSchema.parse({
      ...Object.fromEntries(form),
      parentHedgeId: id,
    });
    const settledPnl = form.get("closePnlUsd")?.toString() || null;
    await prisma.$transaction([
      prisma.hedge.update({
        where: { id },
        data: { status: "settled", settledPnlUsd: settledPnl },
      }),
      prisma.hedge.create({
        data: {
          type: rolled.type,
          direction: rolled.direction,
          pair: rolled.pair,
          notionalLocal: rolled.notionalLocal,
          contractRate: rolled.contractRate,
          tradeDate: asDate(rolled.tradeDate),
          fixingDate: asDate(rolled.fixingDate),
          settlementDate: asDate(rolled.settlementDate),
          counterpartyId: rolled.counterpartyId || old.counterpartyId,
          status: "open",
          parentHedgeId: id,
          notes: rolled.notes || `Roll of ${old.pair} ${old.fixingDate.toISOString().slice(0, 10)}`,
        },
      }),
    ]);
    revalidatePath("/hedges");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --- Manual market quotes ---
const quoteSchema = z.object({
  pair: z.string().min(3),
  tenor: z.string().min(1),
  type: z.enum(["spot", "forward_outright", "forward_points", "vol_atm", "vol_rr25", "vol_bf25", "interest_rate"]),
  value: decimalStr,
});

export async function saveManualQuote(form: FormData): Promise<ActionResult> {
  try {
    const email = await requireSession();
    const q = quoteSchema.parse(Object.fromEntries(form));

    // sanity check vs CIP for forwards (PRD F4: warn at ±10%)
    let warning: string | undefined;
    if (q.type === "forward_outright") {
      const ccy = q.pair.split("/")[0];
      const mkt = await loadMarketView();
      const spot = mkt.spot[ccy];
      const rLocal = mkt.rates[ccy];
      if (spot && rLocal) {
        const days = /^\d{4}-\d{2}-\d{2}$/.test(q.tenor)
          ? daysBetween(new Date(), asDate(q.tenor))
          : { "1M": 30, "3M": 91, "6M": 182, "12M": 365 }[q.tenor] ?? 90;
        const implied = cipForward(spot, rLocal, mkt.usdRate, Math.max(days, 1));
        const dev = cipDeviation(dec(q.value), implied);
        if (dev.abs().gt("0.10")) {
          warning = `Quote is ${dev.mul(100).toFixed(1)}% off CIP-implied (${implied.toFixed(6)}). Saved anyway — verify the convention.`;
        }
      }
    }

    await prisma.marketQuote.create({
      data: {
        pair: q.pair.toUpperCase(),
        tenor: q.tenor,
        type: q.type,
        value: q.value,
        source: "manual",
        quotedAt: new Date(),
        enteredBy: email,
      },
    });
    revalidatePath("/market");
    revalidatePath("/");
    return { ok: true, warning };
  } catch (e) {
    return fail(e);
  }
}

// --- Policies / settings ---
const policySchema = z.object({
  ccy: z.string().length(3),
  targetRatioMin: decimalStr,
  targetRatioMax: decimalStr,
});

export async function savePolicy(form: FormData): Promise<ActionResult> {
  try {
    await requireSession();
    const p = policySchema.parse(Object.fromEntries(form));
    await prisma.hedgePolicy.upsert({
      where: { ccy: p.ccy.toUpperCase() },
      create: { ccy: p.ccy.toUpperCase(), targetRatioMin: p.targetRatioMin, targetRatioMax: p.targetRatioMax },
      update: { targetRatioMin: p.targetRatioMin, targetRatioMax: p.targetRatioMax },
    });
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function acknowledgeAlert(id: string): Promise<ActionResult> {
  try {
    await requireSession();
    await prisma.alert.update({ where: { id }, data: { acknowledgedAt: new Date() } });
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setRecommendationStatus(id: string, status: "reviewed" | "dismissed"): Promise<ActionResult> {
  try {
    await requireSession();
    await prisma.recommendation.update({ where: { id }, data: { status } });
    revalidatePath("/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
