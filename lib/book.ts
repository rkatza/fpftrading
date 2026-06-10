import { prisma } from "@/lib/db";
import { dec } from "@/lib/money";
import type { CashInput, HedgeInput, PositionInput } from "@/lib/engine/types";

/** Load the live book and map Prisma rows to engine inputs. */
export async function loadBook() {
  const [positions, cash, hedges, policies] = await Promise.all([
    prisma.position.findMany({ orderBy: { borrower: "asc" } }),
    prisma.cashBalance.findMany({ include: { counterparty: true }, orderBy: { amount: "desc" } }),
    prisma.hedge.findMany({ include: { counterparty: true }, orderBy: { fixingDate: "asc" } }),
    prisma.hedgePolicy.findMany(),
  ]);

  const positionInputs: PositionInput[] = positions.map((p) => ({
    id: p.id,
    borrower: p.borrower,
    marketValueUsd: dec(p.marketValueUsd.toString()),
    underlyingCcy: p.underlyingCcy,
    exposureFactor: dec(p.exposureFactor.toString()),
    status: p.status,
  }));

  const cashInputs: CashInput[] = cash.map((c) => ({
    id: c.id,
    ccy: c.ccy,
    amount: dec(c.amount.toString()),
  }));

  const hedgeInputs: HedgeInput[] = hedges.map((h) => ({
    id: h.id,
    type: h.type,
    direction: h.direction,
    pair: h.pair,
    notionalLocal: dec(h.notionalLocal.toString()),
    contractRate: dec(h.contractRate.toString()),
    premiumUsd: h.premiumUsd ? dec(h.premiumUsd.toString()) : null,
    strike2: h.strike2 ? dec(h.strike2.toString()) : null,
    fixingDate: h.fixingDate,
    settlementDate: h.settlementDate,
    status: h.status,
  }));

  return { positions, cash, hedges, policies, positionInputs, cashInputs, hedgeInputs };
}
