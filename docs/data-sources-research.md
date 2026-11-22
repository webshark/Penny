# Keeping Penny's data fresh without scraping

Research date: 2026-11-06. Scope: an individual running Penny locally in Israel. Today's paths: `src/server/scrapers` (israeli-bank-scrapers), `src/lib/file-import.ts` (CSV/XLSX), `src/server/bot` (Telegram).

Legend: effort/reliability are S/M/L or Low/Med/High. "Verify" = not confirmed by a source in this pass.

## 1. Options

| # | Source | How it works | User setup | Reliability | Freshness | Privacy / legal | Cost | Build effort |
|---|---|---|---|---|---|---|---|---|
| 1 | **Open Banking (direct)** | BoI standard on Berlin Group NextGenPSD2. Access requires an ISA "financial information service" (AISP) licence under the Financial Information Service Law 2021. Banks expose portals (e.g. Poalim dev portal) only to licensees. | n/a | High | Near real-time | Best-in-class consent, but **an individual cannot practically get a licence** (company, capital, compliance, Israeli registration). | Licence + compliance: prohibitive | L | 
| 2 | **Open Banking via licensed aggregator** | A licensed AISP (about 8 companies licensed since 2022) does consent + pulls data; app consumes the aggregator's API. | OAuth-style bank consent, renew per consent period | High | Daily/real-time | Data passes through a third-party cloud, breaks "local-first". Most Israeli licensees are B2C apps, not public B2B APIs (verify). Card companies' open-banking obligations were **deferred** by the 2026 Arrangements Law. | Commercial contract, unknown | M | 
| 3 | **Email alerts + monthly statements (IMAP / Gmail API)** | Banks/card issuers send per-charge alerts and monthly statement emails (often PDF/XLSX attachments or links). Poll a mailbox locally, parse with per-issuer templates. | Create app password or OAuth once; enable alerts in each issuer app | Med (templates change, some only send links behind login) | Minutes (alerts) / monthly (statements) | Local only; mailbox credential stored locally. Reading your own mail is fine. Gmail restricted scope needs verification only if distributed publicly; IMAP + app password avoids it. | Free | M |
| 4 | **SMS / push forwarding from phone** | Android: SMS forwarder or Tasker -> HTTP/Telegram. iOS: Shortcuts "Message" automation (contains sender) -> send to Telegram bot. Issuers send SMS per charge ("חויב כרטיסך ... ב-xx ש\"ח"). | 10 min one-time per phone | Med-High (Android), Med (iOS automations can need a tap, break silently) | Seconds | Goes through Telegram (already accepted by the app); no bank credentials. | Free | S-M (reuse bot) |
| 5 | **Apple Wallet "Transaction" trigger (iOS 17+)** | Shortcuts personal automation fires on each Apple Pay tap with merchant, amount, card; forward to bot. | 5 min | Med (breaks when cards change; needs mobile data for Wallet) | Instant | Only taps, not online/standing orders. Google Wallet has no equivalent export. | Free | S |
| 6 | **Issuer/bank export files + watched folder** | User downloads XLSX from Max/Cal/Isracard/Amex/bank site; Penny watches `Downloads` and auto-imports known formats with dedupe. | Download once a month | High (formats stable-ish) | Monthly / on demand | Fully local, no ToS issue | Free | S (file-import exists) |
| 7 | **Telegram quick-add ("קפה 18")** | Free-text parser in bot: amount + description, optional card/category; auto-categorise via existing rules. | None | High | Instant | Local + Telegram | Free | S |
| 8 | **Receipt photo / OCR** | Send photo to bot; OCR (local Tesseract heb, or the app's AI provider) extracts total, merchant, date. | None | Med (thermal receipts, Hebrew OCR) | Instant | Images to AI provider if not local | Free / AI tokens | M |
| 9 | **הר הביטוח / מסלקה פנסיונית** | Har HaBituach: user requests an XLSX report of all policies (login via gov ID). Pension clearinghouse: personal report via the clearinghouse/agent, XML/XLSX per product. Import into funds/insurance. | 10 min, 1-4x a year | High | Quarterly/yearly | Local import; never automate gov login | Free | M (new parsers in `src/lib/funds.ts` path) |
| 10 | **Bit / PayBox** | No public API. Payments show on the linked card/bank statement already; Bit/PayBox notifications can be forwarded like SMS (#4) to capture the counterparty/memo. | via #4 | Med | Instant | Same as #4 | Free | S once #4 exists |

## 2. Notes on open banking
- Licences: ISA grants AISP licences under the 2021 law; first batch 2022, Summa reported as the 7th licensee. Foreign providers must register in Israel.
- ISA published a directive for payment companies on implementing the standard (June 2026); 2026 Arrangements Law deferred their obligations. So credit-card coverage via open banking lags banks.
- Conclusion: not a near-term path for a local single-user app. Revisit if a licensee launches a developer/B2B API with per-user pricing.

## 3. Ranked recommendation
1. **Telegram quick-add** (#7) - near zero cost, fills cash/Bit gaps today.
2. **Phone alert forwarding to the bot** (#4 + #5 + #10) - freshest data, no bank credentials. Treat as *pending* transactions, reconciled later.
3. **Watched Downloads folder + one-tap import** (#6) - reliable monthly truth source, reuses `file-import.ts`.
4. **Email alert/statement ingestion via IMAP** (#3) - automated monthly + alerts, more parsing maintenance.
5. **Pension/insurance file import** (#9) - low frequency, high value for net worth.
6. **Receipt OCR** (#8) - nice to have.
7. **Open banking via aggregator** (#2) - only if a B2B offering appears; direct (#1) is not feasible.

Keep scrapers as an optional backend; new sources should feed the same transaction pipeline with dedupe.

## 4. Phased plan (this codebase)

**Phase 1 - quick wins (days)**
- `src/server/bot/commands.ts`: free-text handler `"<desc> <amount>"` / `"<amount> <desc>"` (Hebrew/English, ₪ optional), reply with category + undo button. Unit test for the parser.
- Shared `parseAlert(text)` module (e.g. `src/server/ingest/alerts.ts`) with regexes for Max, Cal, Isracard, Amex, bank SMS and Bit/PayBox; bot routes forwarded/known-format messages there. Fixtures of real (anonymised) SMS texts as tests.
- Mark ingested rows `source: "alert" | "manual"` and `pending`; dedupe against scraper/import rows by (card last 4, amount, date ±2d).
- Docs page in settings: iOS Shortcut (Message + Wallet trigger -> "Send message" to bot) and Android SMS-forwarder setup.

**Phase 2 - files (1 week)**
- Folder watcher in the server (`fs.watch` on a user-chosen folder) calling existing `src/lib/file-import.ts` detectors; toast "Imported 42 from Max" with undo.
- Add/verify format detectors for Max, Cal, Isracard/Amex, major bank XLSX in `file-import.ts`.

**Phase 3 - email (1-2 weeks)**
- `src/server/ingest/imap.ts`: IMAP (app password, stored like scraper credentials), poll every N minutes, issuer-sender allowlist, reuse `parseAlert` for bodies and `file-import` for attachments.

**Phase 4 - long-term assets**
- Har HaBituach XLSX and pension clearinghouse file importers feeding `src/lib/funds.ts` / `/api/funds`.
- Optional receipt OCR in bot via existing `src/server/ai`.

**Phase 5 - watch list**
- Re-check yearly for an AISP offering a developer API; would plug in as another provider under `src/server/scrapers/select.ts`.

## Sources
- ISA first AISP licences: https://thepaypers.com/fintech/news/the-israel-securities-authority-grants-initial-licenses-to-fintechs
- Summa licence (7th): https://barlaw.co.il/insights_and_news/advising-summa-technologies-on-obtaining-financial-services-license
- ISA directive for payment companies / deferral: https://herzoglaw.co.il/en/news-and-insights/israel-securities-authority-publishes-directive-for-payment-companies-regarding-the-implementation-of-an-open-banking-standard/
- BoI open banking guidelines: https://thepaypers.com/fintech/news/the-bank-of-israel-publishes-guidelines-for-implementation-of-the-open-banking-standard-in-israel
- Open finance reform overview: https://thepaypers.com/expert-opinion/israels-open-finance-reform-kicks-off--1259618
- BoI fintech talk 2024: https://www.boi.org.il/media/22pjnqnd/mr-oded-salomy-fintech-connect-december-2024.pdf
- Poalim developer portal FAQ: https://poalimdev.co.il/faq
- iOS 17 Wallet transaction shortcut: https://www.idropnews.com/ios-17/this-new-ios-17-shortcut-will-help-you-keep-track-of-your-spending/197589/
- Wallet automation caveats: https://help.travel-spend.com/shortcuts--automation/ignQHsp85RQDsig2QwVcdX/set-up-apple-pay-automation/7tL8XfjBceg4D7mQeiSK2V
- Shortcut-based expense apps: https://walletpalapp.github.io/ , https://regnskapp.github.io/SiriShortcutsSetup/en.html
