# FPF FX View

Internal FX exposure & hedge management platform for First Principles Fund — a USD credit fund lending to LatAm fintechs. Tracks net FX exposure by currency (PEN, COP, MXN, DOP, BRL), marks the NDF/forward/option hedge book to market daily, models hedge strategies, and generates Claude-powered macro briefs and hedge recommendations.

**This is an analytics tool. No trade execution. AI output is advisory only and never writes to the book.**

See `PRD.md` (what/why), `PLAN.md` (build order), `CLAUDE.md` (conventions).

## Stack

Next.js 16 (App Router, TypeScript strict) · Prisma 7 + PostgreSQL · Tailwind v4 · Recharts · decimal.js (all money/rates — no floats) · NextAuth v5 (4 allow-listed partners) · Anthropic SDK · Vitest + Playwright.

## Setup

```bash
npm install                       # also runs prisma generate
cp .env.example .env              # fill in values (see below)
npx prisma migrate dev            # create schema
npx prisma db seed                # load the Apr 30, 2026 book
npm run dev
```

Log in with one of the four allow-listed emails (`lib/auth.ts`) and the shared `AUTH_PASSWORD`.

### Database

Any PostgreSQL 14+ works. Local: `postgresql://fpf:fpf@localhost:5432/fpf_fx_view`. Production: Neon/Supabase — set `DATABASE_URL`.

### API keys (`.env`)

| Key | Where to get it | Used for |
|---|---|---|
| `TWELVEDATA_API_KEY` | twelvedata.com → Pro plan (~$99/mo) | Primary spot, all 5 pairs |
| `TRADERMADE_API_KEY` | tradermade.com | Fallback spot + forwards |
| `BANXICO_TOKEN` | banxico.org.mx/SieAPIRest (free) | Mexico policy rate |
| `FRED_API_KEY` | fred.stlouisfed.org/docs/api/api_key.html (free) | SOFR |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Macro briefs, recommendations, book Q&A (`AI_MODEL`, default `claude-sonnet-4-6`) |
| `FINPRICING_API_KEY` | finpricing.com (optional) | FX vol surfaces |
| `TRADING_ECONOMICS_KEY` | tradingeconomics.com (optional) | Economic calendar |
| `AUTH_SECRET` | `npx auth secret` | Session signing |
| `AUTH_PASSWORD` | choose one | Shared partner password |
| `CRON_SECRET` | choose one | Bearer token required by `/api/cron/*` |

BCRP (Peru), BanRep (Colombia), and BCB (Brazil) rates use free, keyless APIs.

## Commands

```bash
npm run dev           # dev server
npm run build         # production build
npm run test          # Vitest — engines, market data, seed integrity (54 tests)
npm run test:e2e      # Playwright smoke (needs a browser + seeded DB)
npx prisma migrate dev
npx prisma db seed    # idempotent — resets to the Apr 30, 2026 book
```

Run `npm run test` after every engine change. The MTM regression must reproduce the three Goldman NDFs (+$18,881 / +$26,063 / +$22,915, total $67,859) within $1.

## Architecture

```
lib/engine/      pure functions, no I/O — exposure, NDF MTM, Garman–Kohlhagen
                 options + Malz smile, carry, scenario shocks, margin, alerts
lib/marketdata/  RateProvider adapters (Twelve Data, TraderMade), central-bank
                 fetchers (BCRP/BanRep/Banxico/BCB/FRED), CIP forward, resolution
                 order: fresh manual quote → primary API → fallback → CIP → last-good
lib/ai/          context builder, tool-use chat loop (get_exposures/get_hedges/
                 get_rates/run_scenario), brief + recommendation generators
app/             dashboard, positions, cash, hedges (blotter + roll), market,
                 lab (scenarios/carry/options), ai, reports, settings
proxy.ts         Next 16 proxy (middleware successor) — every route needs a session
```

Conventions that matter (full list in `CLAUDE.md`):

- Pairs are quoted **USD per 1 local unit** (PEN/USD ≈ 0.284). A flipped convention is the most likely source of wrong P&L.
- All money/rates flow through `decimal.js`; Prisma columns are `Decimal`. Rates 8 dp, USD 2 dp.
- Every market datum stores `source` + `quotedAt`; the UI shows staleness badges.
- Manual dealer quotes are first-class and sanity-checked against CIP (±10% warns).

## Cron (production)

`vercel.json` schedules:

- `/api/cron/spot` — every 15 min during market hours: spot refresh via resolution order, CIP forward curve refresh.
- `/api/cron/daily` — 22:00 UTC: central-bank rates, immutable `ExposureSnapshot` per ccy, margin check, alert generation (fixings ≤30d, ratio out of band, spot moves >1.5% d/d, margin shortfall).

Both require `Authorization: Bearer $CRON_SECRET`. Vercel cron sends it automatically when `CRON_SECRET` is set in project env.

## Deploy (Vercel + Neon)

1. Create a Neon Postgres database; set `DATABASE_URL`.
2. `npx prisma migrate deploy && npx prisma db seed` against it.
3. Import the repo into Vercel; set all env vars from `.env.example`.
4. Deploy. Smoke-check: log in → dashboard totals match the admin notebook → `/api/cron/spot` with the bearer token returns fresh quotes.

## Runbook

- **Provider outage** — the dashboard serves last-good values with stale badges; nothing crashes. Check Settings → Providers for key status.
- **Wrong-looking MTM** — first suspect a flipped quote convention on a manual quote (PEN per USD vs USD per PEN). The CIP sanity warning on entry exists for this.
- **Reseed** — `npx prisma db seed` wipes and reloads the canonical Apr-2026 book.
- **Missed fixing** — alerts fire at ≤30d (warning) and ≤7d (critical) on the dashboard strip; acknowledge from the dashboard once handled.
