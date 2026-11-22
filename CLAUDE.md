# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Penny: a local-first personal finance app for Israeli households (Next.js 16 + React 19 + SQLite). Hebrew-first, RTL, runs only on 127.0.0.1. See `AGENTS.md`: this Next.js version differs from training data — check `node_modules/next/dist/docs/` before using Next APIs.

## Commands

```bash
npm run dev                  # http://127.0.0.1:3000
npx tsc --noEmit             # typecheck
npm run lint
npm test                     # Vitest, all of tests/**/*.test.ts
npx vitest run tests/fi.test.ts          # single file
npx vitest run -t "name of test"         # single test by name
npx playwright test          # e2e (e2e/)
npm run build
```

Node 22+. Data lives in `PENNY_DATA_DIR` or `./data` (`penny.db` + encryption key).

## Architecture

- **`src/app/`** — App Router pages and `src/app/api/**/route.ts` handlers. Routes are thin; logic lives in `src/server/`.
- **`src/proxy.ts`** — Next 16 middleware (`proxy`, not `middleware`): host allowlist (DNS-rebinding guard), app-lock gate, same-origin check on mutating requests, optional multi-user access with `x-workspace-id` header. New side-effecting GET routes must be added to `ORIGIN_CHECKED_GETS`.
- **`src/server/db/`** — `getDb()` singleton over better-sqlite3 (WAL). Migrations are numbered `.sql` files in `migrations/` applied in order by `migrate.ts` (plus a few TS migrations there). Add a new migration file; never edit an applied one. Queries in `queries/*.ts` are raw SQL scoped by `workspace_id`.
- **`src/server/`** other areas: `scrapers/` (bank providers, israeli-bank-scrapers), `sync/` (orchestrator, scheduler, OTP bridge), `ai/` (`AIProvider` interface + `factory.ts`; Claude/Ollama/CLI agents), `insights/` (forecasts, recurring, anomalies, obligations), `rules/`, `bot/` (Telegram via grammy), `pension/`, `markets/`.
- **`src/lib/`** — shared pure logic (calculators, forecasts, types) and the client API wrapper `api.ts` (sends active workspace/profile). `types.ts` holds shared types incl. `BANK_PROVIDERS`. Israeli tax numbers live in `il-defaults.ts`, each with year and source.
- **`src/i18n/`** — next-intl; `messages/he.json` and `messages/en.json` must both get every UI string.
- **`desktop/`** — Electron wrapper; `scripts/service/` — OS service install; `website/`, `docs/` — public site/docs.
- Tests: Vitest aliases `server-only` to `tests/server-only-stub.ts`, so server modules are importable in tests. Migration tests run all SQL against a real DB (60s timeout).

## Conventions (from CONTRIBUTING.md)

- TypeScript strict; no `any` without a comment explaining why.
- New pure functions get a Vitest test in `tests/`.
- UI text in both `he.json` and `en.json`; Hebrew text does not use the product name.
- Conventional Commits (`feat:`, `fix:`, …).
- Never commit real bank data, credentials, or screenshots showing them.
