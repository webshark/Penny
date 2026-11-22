# Changelog

All notable changes to Penny. Versions follow [Semantic Versioning](https://semver.org/); dates are Israel time.

## [0.2.0] - 2026-11-21

Everything since 0.1.0 (14 Nov 2026), with 24 database migrations (054–077). Your data is upgraded in
place on first start, and a copy of the database is saved to `data/backups` before any migration runs.

### Highlights

- **A new look.** A calm palette in three themes (light, dark, or follow the device), a side menu that stays put
  while pages change, one top bar with search, a + menu, sync, notifications and settings, and soft motion for every
  open and close. Settings, transactions, budget and analytics were rebuilt around tables and section menus.
- **Money on the table.** One yearly figure for everything the checks found: bank and card fees, overdraft
  interest, foreign-currency fees and exchange-rate markup, small charges that keep coming back, cash sitting idle,
  a possible tax refund, pension and study-fund fees above the market, and overlapping insurance. Each item says
  what to do; marking it done counts it as saved, with undo. On Optimizations and as a Home tile.
- **A full dashboard.** A grid of tiles you can show or hide: balance trend, money on the table, latest
  transactions, cash flow, spending structure, financial-independence progress, watched categories, recurring
  payments, credit utilization and who spent what this month.
- **Every account in one place.** An accounts tree in the sidebar with group totals, an all-accounts screen, a page
  for every account, loan cards, holding cards with buys and sells, and private venture deals.
- **Splitting with people and envelope budgeting.** Mark who owes you part of an expense and settle per person;
  see how much of the month's income every budget already claims.
- **Credit score tracking.** Keep the score from your credit report, follow the trend, and get a yearly reminder
  to ask for the free report.
- **Windows updates itself.** The desktop app downloads a new release, checks it against the published checksum
  and asks to restart (or installs when you close it).
- **Smart without AI.** New transactions are categorized from what the household taught and a built-in dictionary
  of about 200 Israeli merchants; "why spending changed" explains each month merchant by merchant; donations are
  found and their tax credit shown.
- **Correct numbers.** Charges on the 1st of the month land in their month, Max card bills are no longer counted
  twice, installment plans and card forecasts are right, and a balance check flags missing transactions.

### Home and navigation

- The app's frame (side menu, top bar, side rail) stays in place between screens; only the page fades in.
- Dashboard has two views in one split control: Focus (the calm one-page home) and Detailed (the tile grid).
- Month arrows on the dashboard: budget, cash flow, spending structure and the watchlist follow the month.
- Budget, needs attention and goals are tiles in the one grid, packed so no cell is left empty.
- Top bar: search, a + menu (add a transaction, import money from a file, connect a bank, new account or asset;
  N adds a transaction directly), sync, notifications and settings, together at the end of the bar. The phone
  dock's + opens the same menu.
- The dashboard views carry no title on screen (still named for screen readers and the browser tab).
- Notifications (the bell) list what happened: syncs that brought transactions or failed, and goals reached,
  with unread marks and "mark all as read".
- Search is an icon in the top bar that widens in place into the live search (Ctrl K or / too).
- Pip comes alive: it waits while something saves or syncs, nods when it lands and droops when it fails, shows a
  text cursor while you type, looks surprised at news, gets bored when nothing happens, sends a heart when clicked
  and spins its eyes on a double click. Its eyes always follow the pointer (it no longer dozes off), it can be
  squeezed and its antenna pulled, and its head shape is a setting.
- A side rail with Pip and the alerts: Pip is the household's coach, with one alert count on every screen.
- Every page title is the name the side menu uses.
- Dashboard grid with nine tiles plus Money on the table; Customize shows or hides each tile, saved per profile.
- View the dashboard, budget and transactions as one household member, or "shared".
- "Who spent this month" tile per household member.
- Credit utilization tile: card balances against limits you enter once, with an inline editor (Escape or Cancel to close).
- Quick start beside the dashboard: setup tasks that tick themselves from your real data.
- New navigation: Dashboard (Focus and Detailed views), Accounts, Transactions, Planning, Analytics, a distinct icon
  per menu item, and on phones a tab strip per area with the active tab kept in view.
- Focus replaces Simple mode; duplicate screens removed.
- Sidebar: accounts tree with one row per group, a header with the profile menu (accessibility, settings, help,
  lock, sync) and Settings behind the gear.
- Pages use the full screen width (capped at 1920px).
- Search dims the whole screen and no longer swallows clicks.
- Simple mode's menu opens from the corner that holds its button.

### Smart without AI

- Categorizing runs on every sync without AI: merchant memory (which used to run only with AI connected), then a
  dictionary of about 200 unambiguous Israeli merchants and payees (supermarkets, fuel, utilities, municipalities,
  health funds, telecom, streaming, transport). AI, when connected, only sees what is left.
- "Why spending changed" on Overview: this month so far against the same days last month or last year, per
  merchant: price, more or fewer charges, new, gone, or a one-off charge.
- Electricity, water and gas bills (every two months) join the periodic set-aside suggestions.
- Donations are found in the transactions: last tax year's 35% credit (section 46) shows in Money on the table,
  and the credit-points tool fills the amount in.

### Budget

- The budget opens on one line (budget, spent, left, overspent) and a table of groups that open and close; each
  line's budget is edited in place and its bar marks how much of the month has passed. Phones keep the cards.
- Envelope view: "every shekel has a job" – income, what the budgets claim and what's left to assign.
- Period overview side panel: totals, pace against time, recent months against the budget, and what's over.
- Budget by household member.
- The household month can start on salary day; budgets carry over, moves between categories are part of the plan,
  and the recap has a period picker.
- Fixed: the budget line in the side-panel chart and the bars now share one scale.

### Transactions

- The list comes first: one summary line (month, view, income, expenses, net), then the table with every filter
  in its bar; denser rows on desktop.
- Split an expense with people: who owes how much, settle one or "paid it all back" per person, all with undo.
  Shares can't exceed the expense and survive a pending charge being replaced.
- "Who owes me" card on Groups.
- Receipts and invoices attached to a transaction (PDF or photo), carried in backups.
- Templates for entries you add again and again.
- Tag and assign many transactions at once.
- Saved views: keep a set of filters under a name.
- Upcoming charges pinned above the list (late or due in the next 3 days).
- Filter by household member; a Hidden filter for rows kept out of the totals, each restorable.
- Tags and owner in their own columns on wide screens; a row count above the table.
- Foreign-currency charges show their original amount.
- A colored mark for every merchant, drawn locally (no logos fetched).
- Need / want / saving badges on the latest transactions.
- Mark the business part of a transaction; a business report by category and merchant with CSV export.
- Paybacks and refunds are matched to the expense they belong to, lowering its cost instead of counting as income.
- Planned expenses that match themselves to the real charge.
- Optimizations hub: transfer matching, smart categorization, transactions to review and rules on past rows.
- Import from any text (a statement, a receipt, an email), read by your own AI provider.
- Smart sheet import: paste a table, fix cells in place, category suggestions, duplicate detection, undo.

### Accounts, investments and loans

- All-accounts screen with collapsible groups and a page for every account.
- Choose the sidebar's account groups; Account groups and Currencies settings screens.
- Loans screen: what's owed, the monthly cost, progress and end date per loan.
- Investments: a card per holding with value, gain and cost basis; buys and sells per holding.
- A foreign holding's gain is split into price and exchange rate.
- A study fund knows when its money becomes liquid (six years from its opening month).
- Private venture deals with principal, fee, date, status and return.
- Follow your own tickers under Future → Markets.
- Credit score card on Loans.
- Fixed: foreign stocks no longer drop out of net worth when a rate was missing; prices quoted in pence or cents are
  scaled to pounds and rand.

### Planning and analytics

- Analytics is one hub with its own section menu (reports, then tools).
- Pivot table: spending by group and month for 3, 6 or 12 months, with totals, averages and a link from every
  cell to its transactions.
- Net worth history: the line over 6 months, a year or all of it, and what it is made of today.
- Goals show what they need a month against what you actually save.
- Recurring payments: yearly total, count and share of income.
- Trackers: chosen categories over a date range against a limit (three examples in the demo).
- Cash-flow chart, money-flow (Sankey) chart, category donut and spending over time.
- What moved your net worth: saving versus market and value changes.
- Financial-independence variants: lean, today's life, fat and coast.
- A lifetime money model to age 90, and a coach that ranks advice from the month's numbers.
- Balance forecast per bank account.

### Insurance, pension and banking

- Insurance module: policies, documents, real payments matched from the statement, renewals and overlap checks.
- Pension report import from a file your agent sends.
- Open banking over the Israeli XS2A API.
- After every sync the balance change is checked against the transactions; a gap shows on the bank card.
- A bank connected twice shows as two rows, each with its own status, and the failure reason is visible text.

### Telegram

- A summary on Sunday, Tuesday and Thursday mornings (09:00 Israel time).
- After a scheduled sync, a message when a bank starts failing (with the reason) and when it recovers; a bank that
  stays down doesn't repeat the alert.
- Hebrew replies for month, subscriptions, forecast and status.

### Desktop and install

- Windows: the app downloads new releases, verifies them against `SHA256SUMS.txt` and asks to restart, or installs
  when you close it. Mac keeps the update banner until the app is signed.
- The release publishes `SHA256SUMS.txt` for every installer.
- Pip is the app and installer icon; profiles' avatars are Pips that grow.
- The installer file name is pinned so release links stay stable.
- Download-first README, website Mac download that leads with the visitor's operating system.
- Website: a security-first FAQ, privacy and terms pages, a 30-second video, live GitHub stars and downloads,
  a designed share image, and current screenshots throughout.
- A clickable demo on the website (`/demo`, Hebrew and English): the real screens of the demo household, with the
  app's own links clickable. `scripts/capture-demo-tour.mjs` refreshes it from `npm run demo`.

### Safety net and support

- Automatic encrypted backup into a folder you choose (daily or weekly, newest 7 kept): pick one that Google
  Drive, OneDrive, Dropbox or iCloud syncs and your data has an off-computer copy only your passphrase opens.
- A support file (Settings → Data) to attach to a bug report: setup, counts and redacted sync errors, never
  amounts, descriptions, account numbers, names or passwords.
- OFX export next to CSV, for other money apps.

### Settings and appearance

- Settings keep the side menu: /settings lists every section (Personal, Workspace, Help), and each section has
  that list as a card beside it (Back to settings on phones).
- Three themes only: light, dark and follow the device. The see-through look, accent colours and custom colour
  are retired; a saved choice of them opens as light.
- Profile pictures: upload a photo (squared and shrunk in the browser) or keep your initial on a colour.
- Categories as a compact tree: rename and recolour, add a subcategory from a group's menu, move and delete.
- Account groups and accounts use line icons instead of emoji.
- Tags and Payees screens; Language on its own page; Help at the foot of the settings menu.
- Default account for new manual transactions.
- Encrypted backup and restore in one `.pennybak` file (also `npm run backup`).
- A demo household to try every screen without a bank, now with fund fees and overlapping health policies for
  Money on the table to find. Its data lives in the system temp folder, which stops a reload loop in `npm run demo`.

### Fixed – money and data

- Charges dated the 1st of a month (sent by banks as the evening before in UTC) fell out of both months' totals.
  Dates are now stored as the Israeli day; migration 073 rewrites stored rows without re-importing anything.
- With Max connected, the bank's Max bill ("מקס איט פיננסים", "לאומי קארד") was counted as spending on top of the
  card's own charges. Migration 075 fixes stored rows.
- Installment plans were counted twice when the first payment differed by an agora (333.34 / 333.33).
- Card forecasts put a subscription on the bill its charge date fell in, not the one it is billed on.
- "Safe to spend" subtracted a card bill the bank had already debited that day.
- A second sync on the same day erased the balance-gap warning.
- Overlapping insurance was priced from another member's or another kind's policy.
- Cash-flow change compared this month so far with all of last month; it now compares the same days.
- A sync that crashed could stay "running" forever; it now closes as failed.
- An unreadable AI key or bank login fails only that part of the sync, not every workspace.
- Two sync runs in the same second could show the older status.
- Ask's subscriptions answer included unconfirmed series.
- Home, suggestions, net-worth snapshots and imports used the host's time zone (wrong in Docker after midnight).
- Only real card companies count as cards in forecasts.
- "Yesterday" in transactions is computed once instead of on every render.

### Fixed – found in QA

- Adding who owes part of an expense with Enter submitted the whole transaction form instead and nothing was saved
  (a form inside a form); the split is now its own field group.
- On phones the Groups page was wider than the screen and shifted sideways.
- Closing the add-transaction form left `?add=1` in the address, so a reload opened it again.
- Switching the language showed a "saved" message in the old language.
- The sidebar said "no accounts yet" while the accounts were still loading.
- Transaction row checkboxes have a 36px tap area; a checklist step reused another element's id.

### Security and privacy

- Turning the app lock off now turns phone access off too and moves the server back to this computer only; the
  launchers open the network only when the lock is on.
- Backups now carry the real encryption key and restore it, so saved bank logins stay readable after a restore;
  older backups still restore. With the lock on, a restore that brings a different key asks you to unlock first.

### Accessibility and language

- Confirmations and setup steps show their text, not only an icon.
- Dropdowns and the inline budget input have accessible names; repeated row buttons name the item they act on.
- Charts respect reduced motion; truncated names are readable; Hebrew month labels and chart tooltips.
- Bank, card and currency names in your language; the last hard-coded English strings moved to the message files.
- English arrows point the right way; the Money Center, tips, home grid and design studio take their text from
  `he.json` / `en.json`.
- Clear error states everywhere: real messages instead of blank screens, silent hangs or raw codes, and loading
  failures say so instead of showing an empty list.

### Performance

- An index for the statement-twin lookup: a first sync of five years of card history inserts in under a second
  instead of over twelve.
- Failed market-data fetches wait 15 minutes before trying again instead of re-waiting their timeout on every page.
- Grouping in recurring detection and asset history no longer copies arrays per row.

### Developers

- A fake bank and card company run through the real sync pipeline for a simulated week (`tests/fake-bank.test.ts`).
- A golden month with hand-worked totals pins the money facts (`tests/golden-month.test.ts`).
- Opt-in performance test with five years of data: `PENNY_PERF=1 npx vitest run tests/perf-large.test.ts`.
- Playwright covers Money on the table, credit score undo, splits, English titles and sideways scroll on 16 pages.
- Dependabot: weekly dependency updates, with the bank scrapers in their own group.
- CI on every pull request, route types generated before the typecheck, issue and PR templates, CONTRIBUTING.
- 23 new migrations (054–076); tests: 955 unit and integration, 20 end-to-end.

## [0.1.0] - 2026-11-14

First public release.

[0.2.0]: https://github.com/Sergey-Bar/Penny/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Sergey-Bar/Penny/releases/tag/v0.1.0
