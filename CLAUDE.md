# CLAUDE.md — FPF FX View

Internal FX exposure & hedge management platform for First Principles Fund (FPF), a USD credit fund lending to LatAm fintechs. See PRD.md (what/why) and PLAN.md (build order). Follow PLAN.md phases sequentially.

## Context that matters

- Base currency USD. Tracked currencies: PEN, COP, MXN, DOP, BRL — all NDF markets except deliverable MXN. PEN fixing source: BCRP/EMTA.
- Quote convention in the fund's books: PEN/USD as USD per PEN (~0.28). Verify conventions per pair before writing MTM math; a flipped convention is the most likely source of wrong P&L.
- Current real book (seed data, Apr 30, 2026): 3 short PEN/USD NDFs at Goldman with MTM +$18,881 / +$26,063 / +$22,915. These are the regression targets for the MTM engine.
- This is an analytics tool. NO trade execution. AI output is advisory, never auto-applied, never writes to the DB.

## Conventions

- TypeScript strict. Next.js App Router. Prisma + Postgres. shadcn/ui + Tailwind + Recharts. Vitest + Playwright.
- All money and rates: `Decimal` (decimal.js / Prisma Decimal). Never persist floats. Rates 8 dp, USD amounts 2 dp display.
- Every market datum stores `source` and `quotedAt`; UI must show staleness. Resolution order: fresh manual quote → primary API → fallback → CIP-derived → last-good cache.
- Provider integrations live behind the `RateProvider` interface in `lib/marketdata/` — never call provider HTTP from components or engines.
- Engines (`lib/engine/`) are pure functions: data in, results out, no I/O. All financial math unit-tested against hand-computed values before UI wiring.
- Zod-validate every form and API input. Sanity-check manual quotes (warn if >10% off CIP-implied).
- Secrets in env vars only. All routes behind auth (4 allow-listed users).

## Commands

- `npm run dev` / `npm run build`
- `npm run test` (Vitest) — run after every engine change
- `npm run test:e2e` (Playwright)
- `npx prisma migrate dev` / `npx prisma db seed`

## Style

- Direct, recommendation-first tone in any generated report text (FPF house style).
- English UI. Currency names/fixings use market-standard terminology.
