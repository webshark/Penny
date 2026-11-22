# Pension report import — 2026-11-17

A periodic pension / long-term savings report from an insurance agent or advisor (pension, study fund, provident fund, plus the insurance that comes with them), extracted to JSON. The app never reads the PDF: any tool that produces this shape works, and the example is in [`public/pension-report.example.json`](../public/pension-report.example.json).

**Where:** Settings → Accounts and import → Pension, study funds and investment houses → *Import a pension report*. Or `POST /api/pension/report` with the report as the body. `GET /api/pension/report` lists the imports.

## What an import does

- Each product becomes an asset (`pension`, `study_fund` or `provident`) valued at its balance, with a value snapshot on `asOf`. Fees, the monthly deposit and the report's extra data (tracks, components, cover, expected annuity) are stored too.
- Each `insurance` entry becomes a policy (`insurance_policies`), with a monthly premium: a yearly premium is divided by 12, a quarterly one by 3.
- The report header and its summary are kept in `pension_reports`; the same report (same `asOf`, `member` and `source`) is updated, not duplicated.
- Re-importing never duplicates a product: assets are matched by the marker kept in their note (`pension-report:<provider>:<number>:<type>:<name>`). What the user changed themselves is kept: the asset's own name, and a policy's match text, notes, agent and paying account.

## Checks

- `asOf` must be a real `YYYY-MM-DD` date.
- `summary.totalSavings` must be present and the products must add up to it (±2 ILS), so a bad extraction is refused instead of quietly imported.
- Product `type` is one of `pension`, `keren_hishtalmut`, `kupat_gemel`; `name`, `provider` and `balance` are required.
- Two products may not share provider, policy number, type and name.
- Fees must be a percentage up to 10. Limits: 200 products, 50 insurance policies.

## Shape

| Field | | |
|---|---|---|
| `asOf` | required | Report date, `YYYY-MM-DD`. The snapshot date. |
| `member` | optional | Who the report is for. Stored as the report's key and as the policy's insured when it is created. |
| `source` | optional | Where the report came from ("periodic report — agency"). Part of the key. |
| `file`, `issuedAt` | optional | Original file name and issue date, for the record. |
| `agent` | optional | `{ name, agency, phone, email }`; the name and phone go on new policies. |
| `summary` | required | The report's own summary. Only `totalSavings` is read; the rest is kept as JSON. |
| `products[]` | required | See below. |
| `insurance[]` | optional | See below. |

### Product

Required: `type`, `name`, `provider`, `balance`. Optional: `policyNumber`, `feeDeposit`, `feeBalance` (% a year), `employer`, `status` (`active` / `inactive`), `joinDate`, `lastDeposit`, `regularDeposit` (monthly deposit), `insuredSalary`, `expectedAnnuity`, `expectedAnnuityWithDeposits`, `agentOfRecord`, `tracks[]` (`name`, `share`, `balance`, `returns[]`), `components` (`pitzuyim`, `tagmulim`, `capital`), `coverages[]` (`name`, `pct`, `monthly`), `coverageCost` (`disability`, `survivors`).

### Insurance

Required: `name`, `insurer` (or `provider`), `premium`. Optional: `type` — one of `health`, `shaban`, `life`, `mortgage_life`, `disability`, `long_term_care`, `home`, `car`, `travel`, `other`; anything else is stored as `other` — `policyNumber`, `premiumFrequency` (`monthly`, `quarterly`, `yearly`), `startDate`, `matchPattern`, `coverage` (a number), `notes` (e.g. the coverage wording).

## Notes

- The agent report is not the pension clearinghouse (מסלקה) report; that one is still on the roadmap.
- The import runs in one transaction: either the whole report lands, or nothing does.
- Nothing leaves the machine: the JSON is parsed locally and stored in the same SQLite file as everything else.
