# AGENTS.md

See `README.md`, `CLAUDE.md`, `PRD.md`, and `PLAN.md` for product scope, conventions, and the build plan. Standard commands live in `README.md` and `package.json` scripts.

## Cursor Cloud specific instructions

Single product: a Next.js 16 (App Router) app — FPF FX View — backed by Prisma + local PostgreSQL. There is one service to run (`npm run dev`).

### Startup (services are not auto-started on a fresh VM)

- PostgreSQL is installed but not running on boot. Start it before any DB work, dev server, or tests:
  `sudo pg_ctlcluster 16 main start`
- The local DB/role and the `.env` file already exist in the VM snapshot (DB `fpf_fx_view`, role `fpf`/`fpf`, `DATABASE_URL=postgresql://fpf:fpf@localhost:5432/fpf_fx_view`). `.env` is gitignored, so it is never in the repo — if it is ever missing, recreate it with `DATABASE_URL`, `AUTH_SECRET` (any value), and `AUTH_PASSWORD` (dev default `fpf-dev-password`).
- After the DB is up, ensure schema + seed: `npx prisma migrate dev` then `npx prisma db seed` (seed is idempotent and resets to the canonical Apr-30-2026 book).

### Auth / login

- All routes are behind auth; unauthenticated hits redirect to `/login`. If required env vars are missing the proxy redirects to `/setup` instead.
- Log in with an allow-listed email (see `lib/auth.ts`, e.g. `rk@katz.com.pa`) and the shared `AUTH_PASSWORD` (dev default `fpf-dev-password`).

### Gotchas

- The dashboard "Hedge MTM" is discounted to the *current* date, so it drifts above the documented seed regression target of $67,859 (e.g. ~$68k in mid-2026). The exact $18,881 / $26,063 / $22,915 / $67,859 anchors are asserted by `npm run test` against fixed dates, not by the live UI.
- External market-data and AI features are optional: the seed loads manual quotes so exposure/MTM work with no API keys. Provider/AI keys (`TWELVEDATA_API_KEY`, `ANTHROPIC_API_KEY`, etc.) are only needed to exercise live spot refresh, `/api/cron/*`, and the `/ai` pages.
- `npm run test:e2e` (Playwright) starts its own dev server on port 3100 and needs the seeded DB plus a browser; run `npx playwright install` first if browsers are absent.
