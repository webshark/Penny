## What's new in 0.2.0

- **Money on the table.** One yearly figure for every saving the checks found (fees, overdraft interest, foreign-currency markup, idle cash, fund fees above the market, overlapping insurance, a possible tax refund), each with its next step. Mark it done and it counts as saved.
- **A full dashboard.** Tiles you can show or hide: balance trend, cash flow, spending structure, recurring payments, credit utilization, progress to financial independence and who spent what.
- **Every account in one place.** An accounts tree, a page for every account, loan cards, holdings with their buys and sells, and private deals.
- **Split expenses, envelope budgeting and credit score tracking.** Who owes you what, how much of the month's income every budget claims, and your credit score over time.
- **Smart without AI.** New transactions get a category from a built-in dictionary of Israeli merchants and from what you taught it, "why spending changed" explains each month, and donations show their tax credit.
- **Correct to the shekel.** Charges on the 1st land in their month, Max card bills are no longer counted twice, installment plans and card forecasts are right, and a balance check flags missing transactions.
- **Telegram that keeps you posted.** A summary three mornings a week, and a message when a bank stops syncing and when it's back.
- **Windows updates itself.** New releases download in the background, are checked against `SHA256SUMS.txt`, and install when you restart.
- **Try it in the browser.** A clickable demo on the website walks through every screen with a sample household.
- **Safer.** Turning the app lock off also closes phone access, and a restored backup keeps your saved bank logins readable.

The full list is in [CHANGELOG.md](https://github.com/Sergey-Bar/Penny/blob/main/CHANGELOG.md).

## Install

Pick one. Your data stays on your computer in every option.

### Windows: desktop app
1. Download **`Penny-Setup-<version>.exe`** below and run it.
2. Windows SmartScreen may warn that the app is not signed: click **More info → Run anyway** (once).
3. Penny opens from the Start menu. Coming from 0.1.0, run this installer once over the old one; from 0.2.0 on, Penny updates itself: when a new version is out it asks to restart (or installs when you close it).

### Mac: desktop app
1. Download the **`.dmg`** for your Mac: `arm64` for Apple Silicon (M1 and newer), `x64` for Intel.
2. Open it and drag Penny to Applications.
3. The app is not notarized by Apple yet, so the first open is blocked. Open **System Settings → Privacy & Security** and click **Open Anyway** (once).
   If macOS says the app is damaged, run `xattr -cr /Applications/Penny.app` in Terminal and open it again.
4. Bank sync uses Google Chrome or Microsoft Edge, so install one of them if you have neither.

### Docker: Windows, Mac or Linux
Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux) and git.
```bash
git clone https://github.com/Sergey-Bar/Penny.git
cd Penny
git checkout <version tag>
```
Then start it: **Windows** double-click `Penny-docker.bat`; **Mac / Linux** run `./Penny-docker.sh`.
Penny opens at http://127.0.0.1:41234. To update later: `Penny-update.bat` or `./Penny-update.sh`. Each update backs up your data first and rolls back if the new version fails.

Statement files from banks and investment houses go into the import folder (Settings → Data shows it; in Docker it is `imports/`).
