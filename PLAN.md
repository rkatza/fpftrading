# PLAN.md — Implementation Plan for Claude Code

Build the platform described in PRD.md. Work phase by phase; each phase ends with passing tests and a runnable app. Read CLAUDE.md for conventions.

---

## Phase 0 — Scaffold (Day 1)

1. `npx create-next-app@latest fpf-fx-view` — TypeScript, App Router, Tailwind, ESLint.
2. Add: Prisma + PostgreSQL, shadcn/ui, Recharts, `decimal.js`, Zod, `@anthropic-ai/sdk`, Vitest, Playwright.
3. Auth: NextAuth (Auth.js) with email magic link OR simple credentials for 4 allow-listed emails (rk@katz.com.pa, simon@katz.com.pa, isaac@fpffund.com, fernando@fpffund.com). Middleware: every route requires session.
4. `.env.example` with: `DATABASE_URL`, `AUTH_SECRET`, `TWELVEDATA_API_KEY`, `TRADERMADE_API_KEY`, `FINPRICING_API_KEY` (optional), `ANTHROPIC_API_KEY`, `TRADING_ECONOMICS_KEY` (optional).

## Phase 1 — Data model + seed (Day 1–2)

Prisma schema (all money/rates as `Decimal`):

- `User` (email, name)
- `Currency` (code, name, isNdfOnly bool, fixingSource text) — seed USD, PEN, COP, MXN, DOP, BRL
- `Counterparty` (name, type bank|broker|dealer) — seed Goldman, Banco Aliado, Citi, MMG, Morgan Stanley
- `Position` (borrower, country, usdNotional, marketValueUsd, settlementCcy, underlyingCcy, exposureFactor Decimal 0–1, startDate, maturityDate?, status active|repaid, notes)
- `CashBalance` (counterpartyId, account, ccy, amount, asOf, isMarginAccount bool)
- `Hedge` (type NDF|FORWARD|OPTION_CALL|OPTION_PUT|STRUCTURE, direction buy|sell of base ccy, pair e.g. "PEN/USD", notionalLocal, contractRate, premiumUsd?, strike2? for structures, tradeDate, fixingDate, settlementDate, counterpartyId, status open|fixed|settled, settledPnlUsd?, parentHedgeId? for rolls, notes)
- `MarketQuote` (pair, tenor "SPOT"|"1M"|...|date, type spot|forward_outright|forward_points|vol_atm|vol_rr25|vol_bf25|interest_rate, value, source api:twelvedata|api:tradermade|manual|cip|central_bank, quotedAt, enteredBy?)
- `ExposureSnapshot` (date, ccy, grossExposureUsd, cashUsd, hedgeNotionalUsd, netExposureUsd, hedgeRatio, hedgeMtmUsd) — unique (date, ccy)
- `MarginRecord` (counterpartyId, date, postedUsd, requiredUsd, method)
- `HedgePolicy` (ccy, targetRatioMin, targetRatioMax)
- `Recommendation` (createdAt, ccy?, title, body markdown, inputsJson, status new|reviewed|dismissed)
- `Alert` (type, severity, message, ccy?, hedgeId?, createdAt, acknowledgedAt?)

Seed script (`prisma/seed.ts`) with the Apr 30, 2026 book from PRD §4 seed data. Underlying ccy mapping: Lima Bikes→PEN, Welli/Mono→COP, Creizer→MXN, Paycaddy→USD (Panama is dollarized; exposureFactor 0).

**Tests:** schema round-trip, seed integrity (totals match: positions MV $10,695,157; hedge MTM $67,859; cash $4,298,863).

## Phase 2 — Market data layer (Day 2–4)

1. `lib/marketdata/` with a `RateProvider` interface: `getSpot(pair)`, `getHistory(pair, range)`, `getForward?(pair, tenor)`. Implement:
   - `TwelveDataProvider` (primary spot: USD/PEN, USD/COP, USD/MXN, USD/DOP, USD/BRL)
   - `TraderMadeProvider` (fallback spot + forwards where available)
   - `ManualQuoteProvider` (reads latest manual `MarketQuote`)
   - `CipProvider` — forward outright = spot × (1+r_local×t)/(1+r_usd×t); local rates from central-bank fetchers below, USD from FRED SOFR.
2. Central-bank fetchers (free APIs, cache daily): BCRP (Peru reference rate), BanRep (Colombia IBR/policy), Banxico SIE (TIIE/policy; needs free token), BCB SGS (Selic), FRED (SOFR). Store as `MarketQuote` type interest_rate.
3. Resolution order per datum: manual (if fresher than N hours) → primary API → fallback API → CIP → last-good-cached. Always persist with source + quotedAt.
4. Cron routes (Vercel cron or node-cron): spot refresh every 15 min (market hours), daily close + central-bank rates + `ExposureSnapshot` at 22:00 UTC.
5. Manual quote entry UI (dealer quotes: forward outrights, vols) with sanity validation (±10% of CIP-implied → warn).

**Tests:** provider adapters mocked, resolution order, CIP math against a hand-computed example.

## Phase 3 — Engines (Day 4–6)

`lib/engine/`:

1. **Exposure engine:** per ccy: gross = Σ position MV × exposureFactor (underlyingCcy) + cash in ccy; hedgeNotionalUsd = Σ open hedge notional × current forward; net = gross − hedged; ratio = hedged/gross.
2. **MTM engine:** NDF/forward MTM = notionalLocal × (forwardToFixing − contractRate) × sign, discounted at SOFR to settlement, in USD. (For PEN/USD quoted USD-per-PEN as in the Goldman book — confirm convention from seed data: contract rates ~0.294, current ~0.284, short PEN → positive MTM ✓.)
3. **Option pricing:** Garman–Kohlhagen with vol from `MarketQuote` (interpolate ATM/RR/BF → smile via standard 25d parametrization). Price vanilla, collar (buy put/sell call), seagull. Payoff-diagram data generator.
4. **Carry calculator:** annualized hedge cost = (forward − spot)/spot × (365/days).
5. **Scenario engine:** input shocks {spot%, fwdPoints bps, vol pts} → recompute MTM, net exposure, margin estimate. Preset shocks: ±5/10/15%.
6. **Margin estimator:** required = Σ open notional × ccy risk weight (config, default 5–8% EM) − netting benefit (config); compare to posted.
7. **Alert generator** (runs in daily cron): fixing ≤30d, ratio outside `HedgePolicy` band, spot move >1.5% d/d, margin shortfall.

**Tests:** MTM reproduces the three seeded GS NDFs to within $1 of $18,881 / $26,063 / $22,915 given seeded rates; GK pricer vs. known values; scenario math.

## Phase 4 — UI (Day 6–9)

Pages (App Router, shadcn components, Recharts):

1. `/` Dashboard — exposure-by-currency chart + table, hedge ratio gauges vs. policy bands, MTM cards, spot panel with sparklines, alerts strip.
2. `/positions` — table + CRUD drawer; `/cash` similar.
3. `/hedges` — blotter (open/settled tabs), CRUD drawer with auto-computed MTM/days-to-fixing, roll action (closes + pre-fills new), fixing-timeline view.
4. `/market` — spot/forward/vol grids per ccy with source+staleness badges; manual quote entry.
5. `/lab` — scenario runner (shock sliders, P&L table), carry calculator, option structure builder with payoff chart, side-by-side strategy comparison.
6. `/ai` — macro briefs list + on-demand generation, recommendations inbox (review/dismiss), chat over the book.
7. `/reports` — monthly hedge report, print-optimized (FPF house style: direct, recommendation-first).
8. `/settings` — hedge policies, margin weights, providers/keys status, users.

**Tests:** Playwright smoke: login → seed dashboard renders correct totals → create hedge → MTM appears → run scenario.

## Phase 5 — AI layer (Day 9–11)

`lib/ai/` using `@anthropic-ai/sdk` (model: claude-sonnet-4-6 default, configurable):

1. **Context builder:** serialize current exposures, hedge book, policies, latest rates/vols/central-bank data into a compact JSON context.
2. **Macro brief:** weekly cron + on-demand per ccy. Prompt = context + instruction to cover policy rate path, inflation, FX drivers, NDF-implied vs. policy expectations. Use Anthropic web-search tool if enabled for current events; cite sources in output. Store as `Recommendation` type brief.
3. **Hedge recommendation:** given policy bands + carry + scenarios, propose concrete actions with explicit assumptions and "advisory only — verify before executing" footer.
4. **Book Q&A:** chat endpoint with tool-use: tools `get_exposures`, `get_hedges`, `get_rates`, `run_scenario` so answers are computed, not guessed.
5. Guardrails: AI never writes to Position/Hedge tables; outputs labeled; token/cost log.

**Tests:** context builder snapshot test; tool-use loop with mocked Anthropic client.

## Phase 6 — Hardening & ship (Day 11–14)

- Reconciliation view: platform totals vs. manually entered admin-notebook totals, diff highlighted.
- Error handling: provider outage → stale badges, no crashes. Rate-limit budget guard per provider.
- Deploy: Vercel + Neon Postgres; cron config; env vars; smoke test in prod.
- README: setup, API key acquisition steps (Twelve Data, TraderMade, Banxico token, FRED key, Anthropic), runbook.

## Post-v1 backlog (do not build now)

- XLSX import of the admin "NAV Portfolio Notebook" (sheets: Portfolio Valuation, Open Tax Lot, Reconciliation Summary).
- Google Drive auto-ingest; broker execution APIs; multi-role permissions; LSEG NDF curve feed; email/Slack alert delivery.

## Definition of done (v1)

- Seeded Apr-2026 book reproduces admin numbers (PRD §8 metric 1).
- All Phase tests green; Playwright smoke passes.
- Cron jobs running; dashboard live with real spot data for all 5 pairs.
- One generated macro brief and one hedge recommendation reviewed by Raymond.
