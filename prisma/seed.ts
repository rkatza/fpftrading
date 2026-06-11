/**
 * CLI seed entry: `npx prisma db seed`.
 *
 * Loads the FPF book as of Apr 30, 2026 (PRD §4). Regression anchors
 * (PLAN Phase 1/3):
 *  - positions market value totals $10,695,157
 *  - cash totals $4,298,863 (incl. $325k Goldman margin)
 *  - the 3 short PEN/USD NDFs at Goldman MTM to +$18,881 / +$26,063 / +$22,915
 *    given the seeded forward outrights and SOFR 4.30% (act/360 discounting).
 *
 * Quote convention: PEN/USD = USD per 1 PEN (~0.28), per the fund's books.
 * Seed logic lives in lib/seed.ts (shared with /api/setup/seed).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { seedBook } from "../lib/seed";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

seedBook(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
