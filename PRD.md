# PRD — FPF FX View: Currency Exposure & Hedge Management Platform

**Owner:** Raymond Katz, First Principles Fund (FPF)
**Version:** 1.0 — June 10, 2026
**Status:** Approved for build (hand to Claude Code with PLAN.md + CLAUDE.md)

---

## 1. Problem

FPF LP is a USD-denominated credit fund lending to LatAm fintechs (Peru, Colombia, Mexico, Panama, DR). Borrowers collect in local currency, so the fund carries indirect FX exposure even on USD-denominated loans, and hedges it with NDFs (currently 3 short PEN/USD NDFs at Goldman, ~PEN 6.6M notional, +$67.9k MTM as of Apr 30, 2026).

Today this is managed across the fund-admin NAV notebook (XLSX), Goldman statements, and ad-hoc spreadsheets. There is no single view of: net exposure by currency, hedge coverage ratio, hedge MTM vs. live rates, margin posted vs. required, upcoming hedge rolls, or what the carry/cost of hedging is at current forward points.

## 2. Goal

A private web platform where FPF partners can:

1. See net FX exposure by currency (PEN, COP, MXN, DOP, BRL, configurable) across loans, cash, and hedges.
2. Manage the hedge book: enter/edit NDFs, forwards, and FX options; mark them to market daily against live rates.
3. Monitor margin/collateral posted at counterparties vs. estimated requirement.
4. Model hedge strategies: cost of carry, roll schedules, option structures (collars, seagulls), scenario/stress P&L.
5. Get AI macro analysis and hedge recommendations (Claude-powered) grounded in live rates, central-bank data, and the actual book.

**Non-goals (v1):** trade execution (all execution stays manual with Goldman/banks), fund accounting/NAV calculation (admin owns that), multi-user permissions beyond a shared partner login, mobile app.

## 3. Users

4 internal users: Raymond Katz, Simon Katz (partners), Isaac Lukowiecki, Fernando Gonzalez. Single role in v1 (full read/write). Auth via email magic link or password; no public signup.

## 4. Core Concepts & Data Model

- **Position** — a loan/investment: borrower, country, USD notional, settlement currency, *underlying economic currency* (e.g., Lima Bikes is USD-denominated but PEN-linked), start/maturity, rate, mark.
- **CashBalance** — bank/broker, account, currency, amount (e.g., Banco Aliado, Citi, MMG, Morgan Stanley, Goldman margin account).
- **Hedge** — instrument (NDF / deliverable forward / vanilla option / option structure), direction, pair (e.g., PEN/USD), notional, strike/forward rate, trade date, fixing date, settlement date, counterparty, fixing source (e.g., PEN: BCRP/EMTA), premium (options).
- **MarketData** — spot rates, forward points/outrights by tenor, implied vols (ATM/RR/BF), local + USD interest rates, with source and timestamp. Manual quote entry (e.g., a Goldman NDF quote) is a first-class source alongside API feeds.
- **ExposureSnapshot** — computed daily: per currency, gross exposure (positions + cash), hedge notional, net exposure, hedge ratio, hedge MTM.
- **Recommendation** — AI-generated analysis/strategy record with inputs, rationale, and status (new/reviewed/dismissed).

Seed data: the Apr 30, 2026 book — Lima Bikes $1.876M (PEN-linked), Welli T1–T3 $6.0M (COP-linked), Mono $1.396M (COP-linked), Creizer $0.998M (MXN-linked), Paycaddy $0.425M; cash $4.3M; 3 short PEN/USD NDFs at GS (PEN 1,828,329 fix 06/17/26; PEN 2,914,395 fix 11/09/26; PEN 1,837,471 fix 06/01/26); $325k cash at Goldman margin account.

## 5. Functional Requirements

### F1. Dashboard
- NAV-level summary: total exposure by currency (bar/table), hedge ratio per currency, total hedge MTM, margin posted, P&L on hedge book (daily / MTD / since inception).
- Spot panel: live USD/PEN, USD/COP, USD/MXN, USD/DOP, USD/BRL with day change and sparkline.
- Alerts strip: hedges fixing within 30 days, hedge ratio outside target band, large spot moves (>1.5% day), margin shortfall.

### F2. Positions & Cash (manual entry)
- CRUD forms for positions and cash balances. Each position tags its underlying economic currency and an exposure factor (0–100%, how much of the loan's credit performance is FX-linked).
- (Nice-to-have, post-v1: import parser for the admin's "NAV Portfolio Notebook" XLSX to refresh the book monthly.)

### F3. Hedge Book
- CRUD for NDFs/forwards/options with full economics. Auto-compute: days to fixing, MTM = notional × (contract rate − current forward to fixing date) discounted, in USD.
- Roll planner: timeline of fixings/settlements; one-click "roll" that closes a hedge and pre-fills the replacement.
- Trade blotter/history with realized P&L on settled hedges.

### F4. Market Data
- **Spot + history:** API feed, 15-min refresh during market hours, daily close stored.
- **Forwards/NDF points:** API where available; manual quote entry (dealer quotes) with timestamp/source always available; covered-interest-parity fallback computed from local vs. USD rates (BCRP, BanRep, Banxico, BCB, FRED/SOFR).
- **Options vols:** ATM/25d RR/25d BF by tenor where the data plan covers it; manual entry otherwise.
- **Margins:** track posted collateral per counterparty (manual + statement entry); estimate required margin via configurable % of notional or VaR-style add-on; flag shortfall/excess.
- Every stored datum carries source + timestamp; UI shows staleness.

### F5. Strategy & Scenario Lab
- Hedge cost calculator: annualized carry of hedging X% of a currency's exposure at current forward points.
- Scenario engine: shock spot (e.g., PEN ±5/10/15%), shift forward curves, see P&L on hedges, net exposure outcome, and margin impact.
- Option structure builder: price/compare forward vs. collar vs. seagull using entered or fetched vols (Garman–Kohlhagen); payoff diagrams.
- Target hedge policy: per currency, set target hedge ratio band; dashboard tracks compliance.

### F6. AI Macro Analysis & Recommendations (Claude API)
- Weekly (and on-demand) macro brief per currency: central-bank policy, inflation prints, election/政risk, rate differentials — generated by Claude with web search/grounding plus the platform's own data (exposures, hedge book, forward points).
- Hedge recommendations: given target bands, carry costs, and macro view, propose actions ("roll the 06/17 PEN NDF to Dec at X, cost Y bps annualized; consider collaring COP instead of outright forward given Z vol"). Every recommendation shows its inputs and is advisory only — a human executes.
- Q&A chat over the book ("what's my net COP exposure if Welli prepays T1?").

### F7. Reports
- Monthly hedge report (PDF/print view): exposures, hedge ratios, MTM, realized P&L, margin, actions taken — formatted per FPF style for IC/LP use.

## 6. External Integrations (v1)

Budget: professional tier, ~$100–1,000/mo total.

| Need | Provider (v1 pick) | Plan/Price guide | Notes |
|---|---|---|---|
| Spot + historical FX (all 5 pairs) | Twelve Data | Pro, $99/mo | 610+ req/min; USD/PEN, COP, MXN, DOP, BRL covered. Alternative: TraderMade (per-request, ~£30–£250/mo). |
| Forward/NDF points | TraderMade forwards endpoints where covered + manual dealer quotes + CIP-derived fallback | Included / $0 | True LatAm NDF curves (LSEG) are institutional-priced; out of v1 budget. CIP fallback uses free central-bank + FRED rates. |
| Options vols (EM pairs) | FinPricing FX vol surfaces (EOD, JSON API) | Quote (~low hundreds/mo) | ATM/RR/BF to 10y. Manual entry as fallback. CME covers MXN/BRL listed options. |
| Local rates / macro series | BCRP (Peru), BanRep (Colombia), Banxico SIE (Mexico), BCB SGS (Brazil), DR central bank, FRED | Free | Official APIs; also used for NDF fixing references. |
| Economic calendar | Trading Economics API (custom pricing) or free-tier alternative | $0–300/mo | Optional in v1; calendar feeds AI briefs. |
| AI analysis | Anthropic API (Claude) | Usage-based, est. $20–100/mo | Macro briefs, recommendations, book Q&A. |

All API keys live in env vars; a provider-adapter layer isolates each integration so providers can be swapped without touching the engine.

## 7. Technical Requirements

- **Stack:** Next.js (App Router) + TypeScript, PostgreSQL + Prisma, Tailwind + shadcn/ui, Recharts. Anthropic TypeScript SDK. Deployed on Vercel + Neon/Supabase Postgres (or self-host); cron jobs for data refresh and daily snapshots.
- **Precision:** all money/rate math in decimal (no float persistence); rates stored to 8 dp; USD base currency.
- **Auditability:** every market datum and MTM has source + timestamp; snapshots are immutable.
- **Security:** private deployment, auth required on every route, API keys server-side only, no PII beyond user emails.
- **Performance:** dashboard < 2s load; data refresh jobs tolerant to provider failure (serve last good value, flag stale).

## 8. Success Metrics

- Hedge book MTM matches Goldman statement within ±0.5% at month-end.
- Partners check the dashboard weekly+; monthly hedge report produced from the platform (no spreadsheet assembly).
- Every hedge roll decision in H2 2026 references a platform scenario or AI recommendation.
- Zero missed fixings (alerting works).

## 9. Risks & Mitigations

- **LatAm forward/NDF data is thin at this budget** → manual dealer-quote entry is first-class; CIP fallback; revisit LSEG/Bloomberg if the book grows.
- **AI recommendations taken as advice** → recommendations are labeled advisory, show inputs/assumptions, and never auto-execute; this is an internal tool, not investment advice to third parties.
- **Garbage-in on manual entry** → validation (rate sanity bands vs. spot), dual display of source/timestamp, monthly reconciliation view vs. admin notebook.
- **Provider lock-in/outage** → adapter layer + cached last-good values.

## 10. Phasing (summary — see PLAN.md)

- **P1 (week 1–2):** schema, auth, positions/cash/hedge CRUD, seed Apr-2026 book, spot feed, dashboard with exposures + MTM.
- **P2 (week 3–4):** forwards/CIP engine, manual quotes, margin tracking, alerts, roll planner, scenario engine.
- **P3 (week 5–6):** options pricing + structure builder, AI macro briefs + recommendations + book Q&A, monthly report, calendar feed.
