import { describe, expect, it } from "vitest";
import { dec } from "@/lib/money";
import { prisma } from "@/lib/db";
import { loadMarketView } from "@/lib/marketdata/marketview";
import { computeExposures, totalHedgeMtm } from "@/lib/engine/exposure";
import type { CashInput, HedgeInput, PositionInput } from "@/lib/engine/types";

/**
 * Seed integrity (PLAN Phase 1) + end-to-end MTM regression (Phase 3):
 * runs against the seeded local DB. Skipped when DATABASE_URL is absent.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = describe.skipIf(!hasDb);

const AS_OF = new Date("2026-05-01T00:00:00Z");

d("seeded Apr-2026 book", () => {
  it("position MVs total $10,695,157", async () => {
    const agg = await prisma.position.aggregate({ _sum: { marketValueUsd: true } });
    expect(agg._sum.marketValueUsd!.toFixed(2)).toBe("10695157.00");
  });

  it("cash totals $4,298,863 incl. $325k GS margin", async () => {
    const agg = await prisma.cashBalance.aggregate({ _sum: { amount: true } });
    expect(agg._sum.amount!.toFixed(2)).toBe("4298863.00");
    const margin = await prisma.cashBalance.findFirstOrThrow({ where: { isMarginAccount: true } });
    expect(margin.amount.toFixed(2)).toBe("325000.00");
  });

  it("hedge MTM through the full stack reproduces $67,859 within $3", async () => {
    const [positions, cash, hedges, market] = await Promise.all([
      prisma.position.findMany(),
      prisma.cashBalance.findMany(),
      prisma.hedge.findMany(),
      loadMarketView(AS_OF),
    ]);

    const pIn: PositionInput[] = positions.map((p) => ({
      id: p.id,
      borrower: p.borrower,
      marketValueUsd: dec(p.marketValueUsd.toString()),
      underlyingCcy: p.underlyingCcy,
      exposureFactor: dec(p.exposureFactor.toString()),
      status: p.status,
    }));
    const cIn: CashInput[] = cash.map((c) => ({ id: c.id, ccy: c.ccy, amount: dec(c.amount.toString()) }));
    const hIn: HedgeInput[] = hedges.map((h) => ({
      id: h.id,
      type: h.type,
      direction: h.direction,
      pair: h.pair,
      notionalLocal: dec(h.notionalLocal.toString()),
      contractRate: dec(h.contractRate.toString()),
      fixingDate: h.fixingDate,
      settlementDate: h.settlementDate,
      status: h.status,
    }));

    // Valuation as of Apr 30 (quotes are stamped 2026-04-30 22:00 UTC)
    const exposures = computeExposures(pIn, cIn, hIn, market, new Date("2026-04-30T00:00:00Z"));
    const total = totalHedgeMtm(exposures);
    expect(Math.abs(total.toNumber() - 67859)).toBeLessThanOrEqual(3);

    const pen = exposures.find((e) => e.ccy === "PEN")!;
    expect(pen.openHedgeCount).toBe(3);
    // PEN gross = Lima Bikes 1,876,042 (all cash is USD)
    expect(pen.grossExposureUsd.toFixed(2)).toBe("1876042.00");
  });

  it("4 allow-listed users exist", async () => {
    expect(await prisma.user.count()).toBe(4);
  });
});
