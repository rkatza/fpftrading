/**
 * Seed: the FPF book as of Apr 30, 2026 (PRD §4).
 *
 * Regression anchors (PLAN Phase 1/3):
 *  - positions market value totals $10,695,157
 *  - cash totals $4,298,863 (incl. $325k Goldman margin)
 *  - the 3 short PEN/USD NDFs at Goldman MTM to +$18,881 / +$26,063 / +$22,915
 *    given the seeded forward outrights and SOFR 4.30% (act/360 discounting).
 *
 * Quote convention: PEN/USD = USD per 1 PEN (~0.28), per the fund's books.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

export const AS_OF = new Date("2026-04-30T22:00:00.000Z");
const D = (s: string) => new Date(s + "T00:00:00.000Z");

async function main() {
  // Wipe in FK-safe order (idempotent reseed)
  await prisma.alert.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.exposureSnapshot.deleteMany();
  await prisma.marginRecord.deleteMany();
  await prisma.marketQuote.deleteMany();
  await prisma.hedge.deleteMany();
  await prisma.cashBalance.deleteMany();
  await prisma.position.deleteMany();
  await prisma.hedgePolicy.deleteMany();
  await prisma.counterparty.deleteMany();
  await prisma.currency.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { email: "rk@katz.com.pa", name: "Raymond Katz" },
      { email: "simon@katz.com.pa", name: "Simon Katz" },
      { email: "isaac@fpffund.com", name: "Isaac Lukowiecki" },
      { email: "fernando@fpffund.com", name: "Fernando Gonzalez" },
    ],
  });

  await prisma.currency.createMany({
    data: [
      { code: "USD", name: "US Dollar", isNdfOnly: false, fixingSource: null },
      { code: "PEN", name: "Peruvian Sol", isNdfOnly: true, fixingSource: "BCRP/EMTA" },
      { code: "COP", name: "Colombian Peso", isNdfOnly: true, fixingSource: "TRM/EMTA" },
      { code: "MXN", name: "Mexican Peso", isNdfOnly: false, fixingSource: "Banxico FIX" },
      { code: "DOP", name: "Dominican Peso", isNdfOnly: true, fixingSource: "BCRD" },
      { code: "BRL", name: "Brazilian Real", isNdfOnly: true, fixingSource: "PTAX" },
    ],
  });

  const cp = Object.fromEntries(
    await Promise.all(
      (
        [
          ["Goldman Sachs", "dealer"],
          ["Banco Aliado", "bank"],
          ["Citi", "bank"],
          ["MMG Bank", "bank"],
          ["Morgan Stanley", "broker"],
        ] as const
      ).map(async ([name, type]) => {
        const c = await prisma.counterparty.create({ data: { name, type } });
        return [name, c.id] as const;
      })
    )
  );

  // --- Positions (MV totals exactly $10,695,157) ---
  await prisma.position.createMany({
    data: [
      {
        borrower: "Lima Bikes",
        country: "Peru",
        usdNotional: "1800000.00",
        marketValueUsd: "1876042.00",
        settlementCcy: "USD",
        underlyingCcy: "PEN",
        exposureFactor: "1.0000",
        startDate: D("2025-06-15"),
        maturityDate: D("2027-06-15"),
        notes: "USD-denominated, PEN-linked collections",
      },
      {
        borrower: "Welli T1",
        country: "Colombia",
        usdNotional: "2000000.00",
        marketValueUsd: "2031250.00",
        settlementCcy: "USD",
        underlyingCcy: "COP",
        exposureFactor: "1.0000",
        startDate: D("2025-03-01"),
        maturityDate: D("2027-03-01"),
      },
      {
        borrower: "Welli T2",
        country: "Colombia",
        usdNotional: "2000000.00",
        marketValueUsd: "2015625.00",
        settlementCcy: "USD",
        underlyingCcy: "COP",
        exposureFactor: "1.0000",
        startDate: D("2025-07-01"),
        maturityDate: D("2027-07-01"),
      },
      {
        borrower: "Welli T3",
        country: "Colombia",
        usdNotional: "1950000.00",
        marketValueUsd: "1953115.00",
        settlementCcy: "USD",
        underlyingCcy: "COP",
        exposureFactor: "1.0000",
        startDate: D("2026-01-15"),
        maturityDate: D("2028-01-15"),
      },
      {
        borrower: "Mono",
        country: "Colombia",
        usdNotional: "1350000.00",
        marketValueUsd: "1396180.00",
        settlementCcy: "USD",
        underlyingCcy: "COP",
        exposureFactor: "1.0000",
        startDate: D("2025-09-01"),
        maturityDate: D("2027-09-01"),
      },
      {
        borrower: "Creizer",
        country: "Mexico",
        usdNotional: "1000000.00",
        marketValueUsd: "997945.00",
        settlementCcy: "USD",
        underlyingCcy: "MXN",
        exposureFactor: "1.0000",
        startDate: D("2025-11-01"),
        maturityDate: D("2027-11-01"),
      },
      {
        borrower: "Paycaddy",
        country: "Panama",
        usdNotional: "425000.00",
        marketValueUsd: "425000.00",
        settlementCcy: "USD",
        underlyingCcy: "USD",
        exposureFactor: "0.0000",
        startDate: D("2025-05-01"),
        maturityDate: D("2027-05-01"),
        notes: "Panama is dollarized — no FX linkage",
      },
    ],
  });

  // --- Cash (totals exactly $4,298,863) ---
  await prisma.cashBalance.createMany({
    data: [
      { counterpartyId: cp["Banco Aliado"], account: "Operating USD", ccy: "USD", amount: "1250000.00", asOf: D("2026-04-30") },
      { counterpartyId: cp["Citi"], account: "Operating USD", ccy: "USD", amount: "1823863.00", asOf: D("2026-04-30") },
      { counterpartyId: cp["MMG Bank"], account: "Operating USD", ccy: "USD", amount: "600000.00", asOf: D("2026-04-30") },
      { counterpartyId: cp["Morgan Stanley"], account: "Brokerage USD", ccy: "USD", amount: "300000.00", asOf: D("2026-04-30") },
      { counterpartyId: cp["Goldman Sachs"], account: "NDF Margin", ccy: "USD", amount: "325000.00", asOf: D("2026-04-30"), isMarginAccount: true },
    ],
  });

  // --- Hedge book: 3 short PEN/USD NDFs at Goldman ---
  // Contract rates back-solved so MTM vs. the seeded forwards + SOFR 4.30%
  // reproduces the Goldman statement: +$18,881 / +$26,063 / +$22,915.
  await prisma.hedge.createMany({
    data: [
      {
        type: "NDF",
        direction: "sell",
        pair: "PEN/USD",
        notionalLocal: "1828329.00",
        contractRate: "0.29488859",
        tradeDate: D("2025-12-17"),
        fixingDate: D("2026-06-17"),
        settlementDate: D("2026-06-19"),
        counterpartyId: cp["Goldman Sachs"],
        status: "open",
        notes: "GS NDF #1 — PEN fixing BCRP/EMTA",
      },
      {
        type: "NDF",
        direction: "sell",
        pair: "PEN/USD",
        notionalLocal: "2914395.00",
        contractRate: "0.29565114",
        tradeDate: D("2025-11-07"),
        fixingDate: D("2026-11-09"),
        settlementDate: D("2026-11-11"),
        counterpartyId: cp["Goldman Sachs"],
        status: "open",
        notes: "GS NDF #2 — PEN fixing BCRP/EMTA",
      },
      {
        type: "NDF",
        direction: "sell",
        pair: "PEN/USD",
        notionalLocal: "1837471.00",
        contractRate: "0.29682159",
        tradeDate: D("2025-12-01"),
        fixingDate: D("2026-06-01"),
        settlementDate: D("2026-06-03"),
        counterpartyId: cp["Goldman Sachs"],
        status: "open",
        notes: "GS NDF #3 — PEN fixing BCRP/EMTA",
      },
    ],
  });

  // --- Market quotes as of Apr 30, 2026 close ---
  // FX pairs quoted as USD per 1 unit of base ccy (fund convention).
  const q = (
    pair: string,
    tenor: string,
    type:
      | "spot"
      | "forward_outright"
      | "interest_rate"
      | "vol_atm"
      | "vol_rr25"
      | "vol_bf25",
    value: string,
    source: string
  ) => ({ pair, tenor, type, value, source, quotedAt: AS_OF });

  await prisma.marketQuote.createMany({
    data: [
      // Spots
      q("PEN/USD", "SPOT", "spot", "0.28400000", "manual"),
      q("COP/USD", "SPOT", "spot", "0.00023800", "manual"),
      q("MXN/USD", "SPOT", "spot", "0.05420000", "manual"),
      q("DOP/USD", "SPOT", "spot", "0.01650000", "manual"),
      q("BRL/USD", "SPOT", "spot", "0.17850000", "manual"),
      // PEN forward outrights at the exact NDF fixing dates (GS dealer quotes)
      q("PEN/USD", "2026-06-01", "forward_outright", "0.28430000", "manual"),
      q("PEN/USD", "2026-06-17", "forward_outright", "0.28450000", "manual"),
      q("PEN/USD", "2026-11-09", "forward_outright", "0.28650000", "manual"),
      // PEN tenor curve for interpolation/carry
      q("PEN/USD", "1M", "forward_outright", "0.28428000", "manual"),
      q("PEN/USD", "3M", "forward_outright", "0.28520000", "manual"),
      q("PEN/USD", "6M", "forward_outright", "0.28660000", "manual"),
      q("PEN/USD", "12M", "forward_outright", "0.28950000", "manual"),
      // Vols (PEN ATM/RR/BF, 3M) for option lab
      q("PEN/USD", "3M", "vol_atm", "0.07500000", "manual"),
      q("PEN/USD", "3M", "vol_rr25", "-0.01200000", "manual"),
      q("PEN/USD", "3M", "vol_bf25", "0.00350000", "manual"),
      // Interest rates (annualized, decimals)
      q("USD", "ON", "interest_rate", "0.04300000", "central_bank"), // SOFR
      q("PEN", "ON", "interest_rate", "0.04750000", "central_bank"), // BCRP reference
      q("COP", "ON", "interest_rate", "0.09250000", "central_bank"), // BanRep policy
      q("MXN", "ON", "interest_rate", "0.09000000", "central_bank"), // Banxico target
      q("BRL", "ON", "interest_rate", "0.13750000", "central_bank"), // Selic
      q("DOP", "ON", "interest_rate", "0.06750000", "central_bank"), // BCRD policy
    ],
  });

  // --- Hedge policies (target ratio bands) ---
  await prisma.hedgePolicy.createMany({
    data: [
      { ccy: "PEN", targetRatioMin: "0.5000", targetRatioMax: "1.0000" },
      { ccy: "COP", targetRatioMin: "0.2500", targetRatioMax: "0.7500" },
      { ccy: "MXN", targetRatioMin: "0.2500", targetRatioMax: "0.7500" },
    ],
  });

  // --- Margin: posted at GS vs. estimated requirement ---
  await prisma.marginRecord.create({
    data: {
      counterpartyId: cp["Goldman Sachs"],
      date: D("2026-04-30"),
      postedUsd: "325000.00",
      requiredUsd: "117062.05", // Σ notional×fwd × 6% default EM risk weight
      method: "notional_pct",
    },
  });

  console.log("Seeded Apr 30, 2026 book.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
