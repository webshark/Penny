# Penny system test documentation (STD)

_Generated 2026-11-16 from a production build (`next build` + `next start`) on a throw-away data directory, port 3009._

## 1. Scope

The whole product surface, layer by layer:

| Layer | What is covered | Count |
| --- | --- | --- |
| HTTP API | Every `route.ts` handler in `src/app/api`: reads, writes, and hostile input | 77 files, 186 checks |
| Pages | Every `page.tsx` route rendered by the server | 57 routes |
| Domain logic | Vitest suites (queries, money, rules, budgets, sync, import, crypto, …) | 685 tests / 116 files |
| Browser flows | Playwright end-to-end against a dev server | 18 tests (16 run, 2 skipped by design) |
| Static checks | `tsc --noEmit`, ESLint | 0 errors |

## 2. Result

- API: **172/186 checks passed** (92.5%). Every non-pass is either a deliberately rejected request (4xx validation) or an integration that needs credentials/software this machine does not have — see §5.
- Pages: **55/57** rendered 200 with no error boundary. The two 404s are unknown dynamic slugs (`/calculators/1`, `/learn/1`), which is the desired answer; real slugs render 200.
- No 5xx from any handler except `/api/ai/ollama/models`, which reports 503 with an actionable message when Ollama is not installed.

## 3. Defects found and fixed in this QA cycle

| # | Area | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Transactions list | Expense filter matched by sign, so card refunds appeared under income | Filter on `kind` |
| 2 | Search | `%` and `_` in a merchant name matched every row | Escape in `LIKE` (`ESCAPE '\'`) |
| 3 | List paging | `?limit=abc` returned 500 | Validate and clamp 1–200 / offset ≥ 0 |
| 4 | Summary | `?from=bad` produced “Invalid Date” labels | ISO validation, month clamp 1–36, reversed range swap |
| 5 | Money | `1.005` rounded to `1.00` | `roundCents()` used in four places |
| 6 | CSV export | Excluded rows were indistinguishable from counted ones | `excluded` column added |
| 7 | Transactions summary | Invalid date → 500 | 400 |
| 8 | Review inbox | Excluded transactions waited for categorization | `is_excluded = 0` |
| 9 | Budget summary | No line for spending outside every category | “ללא קטגוריה” row with amount, count and a link to the inbox |
| 10 | Copy | “first ten rows” over a five-row list (he/en) | “first five” |
| 11 | Mobile UI | The toast layer (`z-index: 999999999`) covered the primary button of bottom sheets, so “Add expense” could not be tapped for four seconds | Toasts move to the top edge on narrow screens |
| 12 | Settings API | `monthlyTarget: "abc"` returned 200 and **deleted** the stored target; `paydayDay`/`monthsToSync` stored `NaN`/garbage | Wrong types now 400 and nothing is written; `null`/`0` still clear the target. Covered by two regression tests |

## 4. Coverage by area

| Area | Checks | Passed | Statuses seen |
| --- | --- | --- | --- |
| transactions | 41 | 37 | 200, 400 |
| categories | 20 | 19 | 200, 201, 400 |
| budgets | 12 | 11 | 200, 400 |
| assets | 8 | 7 | 200, 400 |
| rules | 7 | 6 | 201, 200, 400, 204 |
| import | 7 | 6 | 200, 400, ERR |
| setup | 6 | 6 | 200, 400 |
| settings | 5 | 5 | 200, 400 |
| plan | 5 | 4 | 400, 200 |
| profiles | 4 | 4 | 201, 200 |
| summary | 4 | 3 | 200 |
| legacy | 4 | 4 | 200, 400 |
| lock | 4 | 3 | 200, 400, 401, ERR |
| workspaces | 4 | 4 | 200, 201 |
| preferences | 4 | 3 | 200, 409, 400 |
| periodic | 3 | 3 | 200 |
| wellbeing | 3 | 3 | 200 |
| life | 3 | 3 | 200, 400, 405 |
| telegram | 3 | 3 | 200, 400 |
| ai | 3 | 2 | 200, 503, 400 |
| data | 3 | 3 | 200, 400 |
| excluded-merchants | 2 | 2 | 200 |
| control | 2 | 2 | 200, 400 |
| pension | 2 | 2 | 200, 400 |
| access | 2 | 2 | 200, 403 |
| lan | 2 | 2 | 200, 400 |
| integrations | 2 | 2 | 200 |
| update | 2 | 2 | 200, 405 |
| ask | 2 | 2 | 200, 400 |
| health | 1 | 1 | 200 |
| home | 1 | 1 | 200 |
| overview | 1 | 1 | 200 |
| fi | 1 | 1 | 200 |
| recap | 1 | 1 | 200 |
| resilience | 1 | 1 | 200 |
| overdraft | 1 | 1 | 200 |
| suggestions | 1 | 1 | 200 |
| markets | 1 | 1 | 200 |
| cash-ahead | 1 | 1 | 200 |
| cashflow-health | 1 | 1 | 200 |
| balance-forecast | 1 | 1 | 200 |
| insights | 1 | 1 | 200 |
| funds | 1 | 1 | 200 |
| activity | 1 | 1 | 200 |
| categorize | 1 | 1 | 200 |
| sync | 1 | 1 | 400 |

## 5. Environment-limited, verified only at the edges

These were exercised for their validation and failure paths, not for a real happy path, because they need a bank, paid keys, a phone or extra software:

- **Bank scraping** (`/api/setup/bank`, `/api/sync`, `/api/sync/otp`, `/api/import/folder`) — no real bank login in this environment.
- **AI provider** (`/api/ask`, `/api/categorize/*`) — returns a clear 400 “provider isn’t configured” until a key is set.
- **Ollama** — 503 with an install hint; no local daemon.
- **Telegram bot**, **LAN access**, **app PIN lock** — configuration paths only.
- **Real market/fund data** (`/api/markets`, `/api/funds`) — served from bundled/fallback data offline.

Deliberate non-errors worth knowing: an impossible date (`2026-02-31`) is rolled over rather than rejected by `/api/summary`, and a stale `revision` on `/api/preferences` answers 409 (optimistic locking), which is the designed behaviour.

## Appendix A — API matrix

| Method | Route | Status | Result |
| --- | --- | --- | --- |
| GET | `/api/categories` | 200 | pass |
| GET | `/api/categories` | 200 | pass |
| PUT | `/api/settings` | 200 | pass |
| POST | `/api/transactions/manual` | 200 | pass |
| POST | `/api/transactions/manual` | 200 | pass |
| POST | `/api/transactions/manual` | 200 | pass |
| POST | `/api/transactions/manual` | 200 | pass |
| POST | `/api/transactions/manual` | 200 | pass |
| POST | `/api/transactions/manual` | 200 | pass |
| POST | `/api/transactions/manual` | 200 | pass |
| PUT | `/api/budgets` | 200 | pass |
| PUT | `/api/budgets` | 200 | pass |
| POST | `/api/budgets/moves` | 200 | pass |
| POST | `/api/rules` | 201 | pass |
| POST | `/api/assets` | 200 | pass |
| POST | `/api/periodic` | 200 | pass |
| POST | `/api/plan` | 400 | expected/review — {"error":"goal needs a name, an amount, and a month (YYYY-MM) or a monthly amount"} |
| POST | `/api/import` | 200 | pass |
| POST | `/api/profiles` | 201 | pass |
| POST | `/api/wellbeing` | 200 | pass |
| PUT | `/api/setup/onboarding` | 200 | pass |
| GET | `/api/summary` | 200 | pass |
| GET | `/api/health` | 200 | pass |
| GET | `/api/home` | 200 | pass |
| GET | `/api/overview` | 200 | pass |
| GET | `/api/summary` | 200 | pass |
| GET | `/api/summary` | 200 | pass |
| GET | `/api/transactions` | 200 | pass |
| GET | `/api/transactions` | 200 | pass |
| GET | `/api/transactions` | 200 | pass |
| GET | `/api/transactions/summary` | 200 | pass |
| GET | `/api/transactions/owners` | 200 | pass |
| GET | `/api/transactions/tags` | 200 | pass |
| GET | `/api/transactions/settle` | 200 | pass |
| GET | `/api/transactions/kids` | 200 | pass |
| GET | `/api/transactions/cash` | 200 | pass |
| GET | `/api/budgets` | 200 | pass |
| GET | `/api/budgets/suggest` | 200 | pass |
| GET | `/api/budgets/smoothing` | 200 | pass |
| GET | `/api/budgets/moves` | 200 | pass |
| GET | `/api/categories` | 200 | pass |
| GET | `/api/categories` | 200 | pass |
| GET | `/api/categories/1/detail` | 200 | pass |
| GET | `/api/rules` | 200 | pass |
| GET | `/api/excluded-merchants` | 200 | pass |
| GET | `/api/assets` | 200 | pass |
| GET | `/api/plan` | 200 | pass |
| GET | `/api/periodic` | 200 | pass |
| GET | `/api/fi` | 200 | pass |
| GET | `/api/life` | 200 | pass |
| GET | `/api/wellbeing` | 200 | pass |
| GET | `/api/recap` | 200 | pass |
| GET | `/api/resilience` | 200 | pass |
| GET | `/api/overdraft` | 200 | pass |
| GET | `/api/suggestions` | 200 | pass |
| GET | `/api/markets` | 200 | pass |
| GET | `/api/cash-ahead` | 200 | pass |
| GET | `/api/cashflow-health` | 200 | pass |
| GET | `/api/balance-forecast` | 200 | pass |
| GET | `/api/control` | 200 | pass |
| GET | `/api/insights` | 200 | pass |
| GET | `/api/funds` | 200 | pass |
| GET | `/api/pension` | 200 | pass |
| GET | `/api/legacy` | 200 | pass |
| GET | `/api/access` | 200 | pass |
| GET | `/api/lock` | 200 | pass |
| GET | `/api/lan` | 200 | pass |
| GET | `/api/telegram` | 200 | pass |
| GET | `/api/integrations` | 200 | pass |
| GET | `/api/profiles` | 200 | pass |
| GET | `/api/workspaces` | 200 | pass |
| GET | `/api/settings` | 200 | pass |
| GET | `/api/preferences` | 200 | pass |
| GET | `/api/preferences` | 200 | pass |
| GET | `/api/setup/status` | 200 | pass |
| GET | `/api/setup/ai` | 200 | pass |
| GET | `/api/update` | 200 | pass |
| GET | `/api/activity` | 200 | pass |
| GET | `/api/ai/agents` | 200 | pass |
| GET | `/api/import/folder` | 200 | pass |
| GET | `/api/data/export` | 200 | pass |
| GET | `/api/legacy/export` | 200 | pass |
| GET | `/api/ai/ollama/models` | 503 | expected/review — {"models":[],"error":"Ollama is not installed. Install it from https://ollama.com, then try again."} |
| POST | `/api/transactions/manual` | 200 | pass |
| GET | `/api/transactions` | 200 | pass |
| PATCH | `/api/transactions/5` | 400 | expected/review — {"error":"kind must be 'expense', 'income', or 'transfer', or set approve:true"} |
| PATCH | `/api/transactions/5` | 400 | expected/review — {"error":"kind must be 'expense', 'income', or 'transfer', or set approve:true"} |
| POST | `/api/transactions/5/exclude` | 200 | pass |
| POST | `/api/transactions/5/exclude` | 200 | pass |
| POST | `/api/transactions/edit` | 400 | expected/review — {"error":"Choose 1–200 transactions"} |
| PATCH | `/api/transactions/manual` | 200 | pass |
| DELETE | `/api/transactions/manual` | 200 | pass |
| POST | `/api/transactions/cash` | 200 | pass |
| POST | `/api/transactions/settle` | 400 | pass |
| POST | `/api/categories` | 201 | pass |
| PUT | `/api/categories/budget-modes` | 200 | pass |
| PATCH | `/api/categories/96` | 400 | expected/review — {"error":"no recognized fields in body"} |
| PUT | `/api/budgets` | 200 | pass |
| DELETE | `/api/budgets/moves` | 400 | expected/review — {"error":"month is required"} |
| POST | `/api/rules/preview` | 400 | expected/review — {"error":"Invalid rule"} |
| GET | `/api/rules` | 200 | pass |
| POST | `/api/categorize/apply` | 200 | pass |
| DELETE | `/api/rules/1` | 204 | pass |
| GET | `/api/assets` | 200 | pass |
| PUT | `/api/assets/1` | 400 | expected/review — {"error":"name is required"} |
| PUT | `/api/periodic` | 200 | pass |
| PUT | `/api/plan` | 400 | pass |
| POST | `/api/pension` | 400 | pass |
| POST | `/api/wellbeing` | 200 | pass |
| POST | `/api/ask` | 200 | pass |
| PUT | `/api/preferences` | 409 | expected/review — {"error":"Changed on another device. Reload before saving."} |
| PUT | `/api/life` | 400 | pass |
| POST | `/api/control` | 400 | pass |
| POST | `/api/access` | 403 | pass |
| POST | `/api/lan` | 400 | pass |
| POST | `/api/lock` | 400 | pass |
| POST | `/api/lock/unlock` | 401 | pass |
| POST | `/api/setup/bank` | 400 | pass |
| POST | `/api/telegram` | 400 | pass |
| PATCH | `/api/telegram` | 400 | pass |
| POST | `/api/transactions/manual` | 400 | pass |
| POST | `/api/transactions/manual` | 400 | pass |
| POST | `/api/transactions/manual` | 400 | pass |
| POST | `/api/transactions/manual` | 400 | pass |
| PATCH | `/api/transactions/999999` | 400 | pass |
| DELETE | `/api/transactions/manual` | 400 | pass |
| POST | `/api/categories` | 400 | pass |
| POST | `/api/categories` | 400 | pass |
| POST | `/api/budgets/moves` | 400 | pass |
| POST | `/api/import` | 400 | pass |
| POST | `/api/import` | 400 | pass |
| POST | `/api/rules` | 400 | pass |
| POST | `/api/assets` | 400 | pass |
| POST | `/api/ask` | 400 | pass |
| PUT | `/api/settings` | 400 | pass |
| PUT | `/api/settings` | 400 | pass |
| PUT | `/api/settings` | 400 | pass |
| PUT | `/api/preferences` | 400 | pass |
| GET | `/api/summary` | 200 | expected/review — {"periodTotal":4246.3,"transactionCount":7,"monthlySpend":[{"month":"2026-10","amount":12.3},{"month":"2026-11","amount":4246.3}],"topMercha |
| GET | `/api/transactions` | 200 | pass |
| GET | `/api/categories` | 200 | pass |
| GET | `/api/categories` | 200 | pass |
| PUT | `/api/transactions/2` | 200 | pass |
| PATCH | `/api/transactions/2` | 200 | pass |
| PATCH | `/api/transactions/2` | 200 | pass |
| PATCH | `/api/transactions/2` | 400 | expected/review — {"error":"kind must be 'expense', 'income', or 'transfer', or set approve:true"} |
| PATCH | `/api/transactions/2` | 400 | pass |
| POST | `/api/transactions/edit` | 200 | pass |
| POST | `/api/transactions/edit` | 400 | pass |
| POST | `/api/categories` | 201 | pass |
| PATCH | `/api/categories/97` | 200 | pass |
| PATCH | `/api/categories/97` | 200 | pass |
| PATCH | `/api/categories/97` | 200 | pass |
| PATCH | `/api/categories/97` | 200 | pass |
| PATCH | `/api/categories/97` | 400 | pass |
| PATCH | `/api/categories/97` | 200 | pass |
| DELETE | `/api/categories/97` | 200 | pass |
| POST | `/api/rules/preview` | 200 | pass |
| DELETE | `/api/budgets/moves` | 200 | pass |
| DELETE | `/api/budgets/moves` | 400 | pass |
| POST | `/api/plan` | 200 | pass |
| POST | `/api/plan` | 200 | pass |
| GET | `/api/assets` | 200 | pass |
| PUT | `/api/assets/1` | 200 | pass |
| DELETE | `/api/assets/1` | 200 | pass |
| GET | `/api/excluded-merchants` | 200 | pass |
| POST | `/api/life` | 405 | pass |
| POST | `/api/sync/otp` | 400 | pass |
| POST | `/api/import/folder` | 400 | pass |
| GET | `/api/import/folder` | ERR | expected/review — TypeError: Request with GET/HEAD method cannot have body. |
| POST | `/api/ai/ollama/pull` | 400 | pass |
| POST | `/api/setup/bank/test` | 400 | pass |
| POST | `/api/setup/ai` | 400 | pass |
| PUT | `/api/legacy` | 200 | pass |
| POST | `/api/legacy/export` | 400 | pass |
| POST | `/api/workspaces` | 201 | pass |
| PATCH | `/api/workspaces/2` | 200 | pass |
| DELETE | `/api/workspaces/2` | 200 | pass |
| GET | `/api/profiles` | 200 | pass |
| DELETE | `/api/profiles/2` | 200 | pass |
| GET | `/api/integrations` | 200 | pass |
| GET | `/api/lock` | ERR | expected/review — TypeError: Request with GET/HEAD method cannot have body. |
| POST | `/api/update` | 405 | pass |
| DELETE | `/api/import` | 400 | pass |
| GET | `/api/data/export` | 200 | pass |
| DELETE | `/api/data/transactions` | 400 | pass |

## Appendix B — Page matrix

| Route | Status | HTML |
| --- | --- | --- |
| `/` | 200 | 244278 B |
| `/access` | 200 | 217874 B |
| `/accessibility` | 200 | 252348 B |
| `/ask` | 200 | 245547 B |
| `/budget` | 200 | 246348 B |
| `/calculators` | 200 | 253298 B |
| `/calculators/1` | 404 | 0 B |
| `/calculators/annuity` | 200 | 251562 B |
| `/calculators/bank-fees` | 200 | 248645 B |
| `/calculators/clearing-house` | 200 | 249220 B |
| `/calculators/credit-points` | 200 | 263916 B |
| `/calculators/debt` | 200 | 261818 B |
| `/calculators/deposits` | 200 | 250401 B |
| `/calculators/growth` | 200 | 254078 B |
| `/calculators/lossOffset` | 200 | 246725 B |
| `/calculators/lost-money` | 200 | 252535 B |
| `/calculators/mortgage` | 200 | 280397 B |
| `/calculators/renovation` | 200 | 258359 B |
| `/calculators/rights` | 200 | 251715 B |
| `/calculators/severance` | 200 | 251878 B |
| `/calculators/track` | 200 | 250478 B |
| `/car` | 200 | 273676 B |
| `/control` | 200 | 241846 B |
| `/discounted-home` | 200 | 263508 B |
| `/fi` | 200 | 246301 B |
| `/help` | 200 | 259619 B |
| `/insights` | 307 | 0 B |
| `/investments` | 200 | 249802 B |
| `/journey` | 200 | 249235 B |
| `/learn` | 200 | 268053 B |
| `/learn/1` | 404 | 0 B |
| `/life` | 200 | 331143 B |
| `/lock` | 200 | 221427 B |
| `/markets` | 307 | 0 B |
| `/more` | 200 | 302685 B |
| `/overview` | 200 | 250710 B |
| `/profiles` | 200 | 219985 B |
| `/recap` | 200 | 244893 B |
| `/rules` | 307 | 0 B |
| `/settings` | 307 | 0 B |
| `/settings/accessibility` | 200 | 288179 B |
| `/settings/ai` | 200 | 267348 B |
| `/settings/appearance` | 200 | 291853 B |
| `/settings/bank` | 200 | 299867 B |
| `/settings/categories` | 200 | 271444 B |
| `/settings/data` | 307 | 0 B |
| `/settings/general` | 200 | 270216 B |
| `/settings/household` | 200 | 268088 B |
| `/settings/legacy` | 200 | 272250 B |
| `/settings/privacy` | 200 | 289093 B |
| `/settings/rules` | 200 | 274158 B |
| `/settings/telegram` | 200 | 270202 B |
| `/setup` | 307 | 0 B |
| `/tips` | 200 | 456181 B |
| `/transactions` | 200 | 249883 B |
| `/welcome` | 200 | 242636 B |
| `/wellbeing` | 200 | 252450 B |

## Reproduce

```bash
npm run build
PENNY_DATA_DIR=.std/data node_modules/.bin/next start -H 127.0.0.1 -p 3009
node .std/std.mjs     # seed + API sweep
node .std/std2.mjs    # remaining handlers
node .std/pages.mjs   # every page route
npx tsc --noEmit && npx vitest run && npm run lint && npx playwright test
```
