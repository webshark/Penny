import "server-only";

import { addDays, monthDay, projectAccounts, type AccountEventInput, type BalanceForecastPayload, type CardBankLink } from "@/lib/balance-forecast";
import { BANK_PROVIDERS } from "@/lib/types";
import { getDb } from "@/server/db";
import { listAccountBalances } from "@/server/db/queries/assets";
import { cashReserve } from "@/server/db/queries/financial-control";
import { getPlan } from "@/server/db/queries/plan";
import { plannedPaymentsForForecast } from "@/server/db/queries/planned";
import { getWorkspaceSetting, setWorkspaceSetting } from "@/server/db/queries/settings";
import { israelToday } from "@/server/lib/date-utils";
import { isBankProvider } from "@/server/lib/transfers";
import { isCardProvider } from "@/server/lib/card-providers";
import { loadInsights } from "./data";
import { forecastCards } from "./forecast";
import { bankObligations } from "./obligations";

const MAPPING_KEY = "forecast_card_banks";
const WINDOW_DAYS = 90;

interface BankAccount {
  account: string;
  provider: string;
  name: string;
  balance: number;
  balanceDate: string | null;
}

interface CardAccount {
  account: string;
  provider: string;
  name: string;
}

const providerName = (id: string) => BANK_PROVIDERS.find((p) => p.id === id)?.name ?? id;
const last4 = (account: string) => (account.length > 4 ? account.slice(-4) : account);
const bankName = (provider: string, account: string) => `${providerName(provider)} · ${last4(account)}`;
const cardName = (provider: string, account: string) => `${providerName(provider)} · ${last4(account)}`;

/** Card brand words that identify the card in a bank's debit description. */
const CARD_PATTERNS: Record<string, RegExp> = {
  isracard: /ישראכרט|ישרא\s?כארד|\bISRACARD\b/i,
  cal: /כ[\s.\-־]?א[\s.\-־]?ל|\bCAL\b/i,
  max: /מקסימום|מקס|\bMAX\b/i,
  amex: /אמריקן\s*אקספרס|\bAMEX\b|\bAMERICAN\s+EXPRESS\b/i,
};
const ANY_CARD_PAYMENT = /ויזה|ישראכרט|ישרא[\s־-]?כארד|כ[\s.\-־]?א[\s.\-־]?ל|מקסימום|מאסטרקארד|אמריקן\s*אקספרס|דיינרס|תשלום\s*אשראי|כרטיס\s*אשראי|חיוב\s*כרטיס|חיוב\s*לכרטיס|\bISRACARD\b|\bVISA\b|\bMASTERCARD\b|\bCAL\b|\bMAX\b|\bDINERS\b|\bAMEX\b/i;

/** The bank accounts money actually moves through: synced balances of bank providers. */
function bankAccounts(workspaceId: number): BankAccount[] {
  return listAccountBalances(workspaceId)
    .filter((b) => isBankProvider(b.provider))
    .map((b) => ({
      account: b.accountNumber,
      provider: b.provider,
      name: bankName(b.provider, b.accountNumber),
      balance: b.balance,
      balanceDate: b.updatedAt ? String(b.updatedAt).slice(0, 10) : null,
    }))
    .sort((a, b) => b.balance - a.balance || a.account.localeCompare(b.account));
}

/** Card accounts seen in transactions, with the provider that issued them. */
function cardAccounts(workspaceId: number): CardAccount[] {
  const rows = getDb()
    .prepare(
      `SELECT account_number AS account, provider FROM transactions
       WHERE workspace_id = ? GROUP BY account_number, provider ORDER BY provider, account_number`
    )
    .all(workspaceId) as { account: string; provider: string }[];
  return rows
    .filter((r) => isCardProvider(r.provider))
    .map((r) => ({ account: r.account, provider: r.provider, name: cardName(r.provider, r.account) }));
}

/** User-chosen card→bank links, ignoring entries whose bank no longer exists. */
function savedMapping(workspaceId: number, banks: Set<string>): Record<string, string> {
  try {
    const raw = JSON.parse(getWorkspaceSetting(workspaceId, MAPPING_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && banks.has(v))) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveCardBankMapping(workspaceId: number, card: string, bank: string | null): boolean {
  const banks = new Set(bankAccounts(workspaceId).map((b) => b.account));
  if (bank !== null && !banks.has(bank)) return false;
  const cards = new Set(cardAccounts(workspaceId).map((c) => c.account));
  if (!cards.has(card)) return false;
  const next = savedMapping(workspaceId, banks);
  if (bank === null) delete next[card];
  else next[card] = bank;
  setWorkspaceSetting(workspaceId, MAPPING_KEY, JSON.stringify(next));
  return true;
}

/**
 * Which bank pays each card's statement. A saved link wins; otherwise we look for the bank's
 * card-payment transfers that name the card brand. That is a guess, so it is marked inferred.
 */
function cardBankLinks(workspaceId: number, banks: BankAccount[], cards: CardAccount[], primary: BankAccount | null): CardBankLink[] {
  const saved = savedMapping(workspaceId, new Set(banks.map((b) => b.account)));
  const since = addDays(israelToday(), -180);
  const transfers = getDb()
    .prepare(
      `SELECT account_number AS account, description FROM transactions
       WHERE workspace_id = ? AND kind = 'transfer' AND date >= ?`
    )
    .all(workspaceId, since) as { account: string; description: string }[];
  const bankSet = new Set(banks.map((b) => b.account));
  const own = transfers.filter((t) => bankSet.has(t.account));

  const counts = new Map<string, Map<string, number>>();
  for (const card of cards) {
    const pattern = CARD_PATTERNS[card.provider] ?? ANY_CARD_PAYMENT;
    const perBank = new Map<string, number>();
    for (const t of own) {
      if (!pattern.test(t.description)) continue;
      perBank.set(t.account, (perBank.get(t.account) ?? 0) + 1);
    }
    counts.set(card.account, perBank);
  }
  // A lone card also claims generic card-payment transfers, which name no brand.
  if (cards.length === 1) {
    const perBank = counts.get(cards[0].account)!;
    for (const t of own) {
      if (ANY_CARD_PAYMENT.test(t.description)) perBank.set(t.account, (perBank.get(t.account) ?? 0) + 1);
    }
  }

  return cards.map((card) => {
    const chosen = saved[card.account];
    if (chosen) return { card: card.account, cardName: card.name, bank: chosen, inferred: false };
    const perBank = counts.get(card.account) ?? new Map<string, number>();
    const [best] = [...perBank.entries()].sort((a, b) => b[1] - a[1]);
    const bank = best?.[0] ?? primary?.account ?? banks[0]?.account ?? "";
    return { card: card.account, cardName: card.name, bank, inferred: true };
  });
}

/** Average monthly income that lands directly in each bank account, from the last 3 complete months. */
function incomeByAccount(workspaceId: number, today: string, banks: BankAccount[]): Map<string, number> {
  const [y, m] = today.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1 - 3, 1)).toISOString().slice(0, 10);
  const to = `${today.slice(0, 7)}-01`;
  const rows = getDb()
    .prepare(
      `SELECT account_number AS account, SUM(charged_amount) AS amount FROM transactions
       WHERE workspace_id = ? AND kind = 'income' AND status = 'completed' AND is_excluded = 0
         AND date >= ? AND date < ?
       GROUP BY account_number`
    )
    .all(workspaceId, from, to) as { account: string; amount: number }[];
  const bankSet = new Set(banks.map((b) => b.account));
  const out = new Map<string, number>();
  for (const r of rows) if (bankSet.has(r.account) && r.amount > 0) out.set(r.account, r.amount / 3);
  return out;
}

/**
 * Everyday spend per day on each bank account: cash, Bit, debit purchases and one-off debits,
 * after taking out the recurring items that are forecast separately.
 */
function dailyRates(workspaceId: number, today: string, banks: BankAccount[], series: { account: string; status: string; cadence: string; expectedAmount: number }[]): Map<string, number> {
  const from = addDays(today, -WINDOW_DAYS);
  const rows = getDb()
    .prepare(
      `SELECT account_number AS account, SUM(-charged_amount) AS amount FROM transactions
       WHERE workspace_id = ? AND kind = 'expense' AND status = 'completed' AND is_excluded = 0 AND date >= ?
       GROUP BY account_number`
    )
    .all(workspaceId, from) as { account: string; amount: number }[];
  const bankSet = new Set(banks.map((b) => b.account));
  const recurring = new Map<string, number>();
  for (const s of series) {
    if (s.status !== "suggested") continue;
    const perMonth = s.cadence === "weekly" ? s.expectedAmount * (52 / 12) : s.cadence === "yearly" ? s.expectedAmount / 12 : s.expectedAmount;
    recurring.set(s.account, (recurring.get(s.account) ?? 0) + perMonth);
  }
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!bankSet.has(r.account)) continue;
    const everyday = Math.max(0, r.amount - (recurring.get(r.account) ?? 0) * 3);
    out.set(r.account, everyday / WINDOW_DAYS);
  }
  return out;
}

/**
 * The 90-day balance of every bank account: salary, card statements mapped to the bank that pays
 * them, recurring debits, planned purchases and everyday spending, each with a low/high band.
 */
export function buildAccountsForecast(workspaceId: number, today = israelToday(), days = WINDOW_DAYS): BalanceForecastPayload | null {
  const banks = bankAccounts(workspaceId);
  if (!banks.length) return null;

  const billingDay = Number(process.env.CARD_BILLING_DAY) || 10;
  const insights = loadInsights(workspaceId, today, billingDay);
  const cards = cardAccounts(workspaceId);
  const primary = banks[0] ?? null;
  const links = cardBankLinks(workspaceId, banks, cards, primary);
  const bankOf = new Map(links.map((l) => [l.card, l.bank]));
  const bankSet = new Set(banks.map((b) => b.account));
  const events: AccountEventInput[] = [];
  const horizonEnd = addDays(today, days);
  const tomorrow = addDays(today, 1);

  // Salary: each account's own average income, on the payday the household already uses.
  const payday = getPlan(workspaceId).monthStartDay;
  for (const [account, income] of incomeByAccount(workspaceId, today, banks)) {
    if (!(income > 0)) continue;
    const [y, m] = today.split("-").map(Number);
    for (let k = 0; k <= Math.ceil(days / 28) + 1; k++) {
      const date = monthDay(y, m - 1 + k, payday);
      if (date < tomorrow || date > horizonEnd) continue;
      events.push({ date, account, name: "", amount: income, kind: "income", estimated: true });
    }
  }

  // Direct bank debits: detected subscriptions and hand-entered commitments.
  for (const o of bankObligations(workspaceId, insights.series, tomorrow, horizonEnd)) {
    const account = o.account && bankSet.has(o.account) ? o.account : primary?.account;
    if (!account) continue;
    events.push({ date: o.date, account, name: o.name, amount: -o.total, kind: "recurring", estimated: true });
  }

  // Card statements land in the bank that pays the card.
  for (const bill of forecastCards({ today, cards: insights.cards, series: insights.series, installments: insights.installments })) {
    if (!bill.account || bill.date < tomorrow || bill.date > horizonEnd) continue;
    const account = bankOf.get(bill.account) ?? primary?.account;
    if (!account) continue;
    const card = cards.find((c) => c.account === bill.account);
    events.push({
      date: bill.date,
      account,
      name: card?.name ?? cardName("", bill.account),
      amount: -bill.total,
      kind: "card",
      estimated: true,
      card: bill.account,
    });
  }

  // Planned purchases: a bank item leaves its own account, a card item leaves with the statement.
  for (const p of plannedPaymentsForForecast(workspaceId, today, billingDay)) {
    if (!p.account) continue;
    const account = p.accountKind === "bank" ? (bankSet.has(p.account) ? p.account : primary?.account) : (bankOf.get(p.account) ?? primary?.account);
    if (!account) continue;
    // A date that passed without the row arriving is still expected, from tomorrow.
    const date = p.chargeDate < tomorrow ? tomorrow : p.chargeDate;
    if (date > horizonEnd) continue;
    const installment = p.n > 1 || p.chargeMonth ? ` (${p.n})` : "";
    events.push({
      date,
      account,
      name: `${p.description}${installment}`,
      amount: -p.amount,
      kind: "planned",
      estimated: false,
      card: p.accountKind === "card" ? p.account : null,
    });
  }

  const rates = dailyRates(workspaceId, today, banks, insights.series);
  const forecast = projectAccounts({
    today,
    accounts: banks.map((b) => ({
      account: b.account,
      name: b.name,
      provider: b.provider,
      balance: b.balance,
      balanceDate: b.balanceDate,
      dailyRate: rates.get(b.account) ?? 0,
    })),
    events,
    days,
    buffer: cashReserve(workspaceId),
  });

  return { ...forecast, cardBanks: links };
}
