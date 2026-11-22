import "server-only";
import { bankObligations } from "./obligations";
import { addDays } from "@/lib/balance-forecast";
import { cashReserve } from "@/server/db/queries/financial-control";

import { getDb } from "@/server/db";
import { loadInsights } from "@/server/insights/data";
import { forecastCards } from "@/server/insights/forecast";
import { listAccountBalances } from "@/server/db/queries/assets";
import { getMonthlyAverages } from "@/server/db/queries/fi";
import { getPlan } from "@/server/db/queries/plan";
import { cashAhead, type CashAhead } from "@/lib/cash-ahead";
import { BANK_PROVIDERS } from "@/lib/types";

const BANKS = BANK_PROVIDERS.filter((b) => b.kind === "bank").map((b) => b.id);

/** "Left to spend until payday": synced bank balance, minus card bills due first; expected salary is not spendable yet. */
export function computeCashAhead(ws: number, today: string): CashAhead {
  const balances = listAccountBalances(ws);
  const i = loadInsights(ws, today, Number(process.env.CARD_BILLING_DAY) || 10);
  const bills = forecastCards({ today, cards: i.cards, series: i.series, installments: i.installments });
  const payday = getPlan(ws).monthStartDay;
  const { monthlyIncome } = getMonthlyAverages(ws);
  const monthStart = `${today.slice(0, 7)}-01`;
  const incomeSoFar = (getDb()
    .prepare(
      `SELECT COALESCE(SUM(charged_amount), 0) as total FROM transactions
       WHERE workspace_id = ? AND kind = 'income' AND status = 'completed' AND is_excluded = 0 AND date >= ? AND date <= ?`
    )
    .get(ws, monthStart, today) as { total: number }).total;

  return { accounts: balances.map(b => ({ ...b, accountNumber: b.accountNumber.slice(-4) })), ...cashAhead({
    today,
    payday,
    bank: balances.length ? balances.reduce((s, b) => s + b.balance, 0) : null,
    bills: bills.map((b) => ({ date: b.date, total: b.total })),
    monthlyIncome,
    incomeSoFar,
    bankDebits: bankObligations(ws,i.series,today,addDays(today,35)),
    reservedCash: cashReserve(ws),
    // A card bill the bank debited today (a card-bill transfer from a bank account) is already out of the balance.
    billPaidToday: !!getDb()
      .prepare(`SELECT 1 FROM transactions WHERE workspace_id = ? AND date = ? AND kind = 'transfer' AND charged_amount < 0 AND provider IN (${BANKS.map(() => "?").join(",")}) LIMIT 1`)
      .get(ws, today, ...BANKS),
  }) };
}
