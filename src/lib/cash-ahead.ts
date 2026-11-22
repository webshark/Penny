export interface CashAhead {
  accounts?: { provider: string; accountNumber: string; balance: number; updatedAt: string }[];
  /** Null when no bank account has synced a balance yet. */
  safeToSpend: number | null;
  bank: number | null;
  billsDue: number;
  bankDebitsDue?: number;
  reservedCash?: number;
  salaryExpected: number;
  /** Next payday, YYYY-MM-DD. */
  until: string;
  daysLeft: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Money free to spend until the next salary: what is in the bank, minus card bills that fall before
 * payday. Expected salary is disclosed separately and never added to available cash.
 */
export function cashAhead(input: {
  today: string;
  payday: number;
  bank: number | null;
  bills: { date: string; total: number }[];
  monthlyIncome: number;
  incomeSoFar: number;
  bankDebits?: {date:string;total:number}[];
  reservedCash?: number;
  /** The bank already shows today's card-bill debit, so a bill dated today is in the balance and not still due. */
  billPaidToday?: boolean;
}): CashAhead {
  const [y, m, d] = input.today.split("-").map(Number);
  const next = d < input.payday ? new Date(y, m - 1, input.payday) : new Date(y, m, input.payday);
  const until = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  const daysLeft = Math.round((next.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
  const due = (b: { date: string }) => (input.billPaidToday ? b.date > input.today : b.date >= input.today) && b.date <= until;
  const billsDue = input.bills.filter(due).reduce((s, b) => s + b.total, 0);
  // Salary still to come before the period ends: only when payday is later this month and it has not landed.
  const salaryExpected = d < input.payday && input.incomeSoFar < input.monthlyIncome * 0.5 ? input.monthlyIncome : 0;
  const bankDebitsDue=(input.bankDebits??[]).filter(b=>b.date>=input.today&&b.date<=until).reduce((sum,b)=>sum+b.total,0);
  const reservedCash=Math.max(0,input.reservedCash??0);
  return {
    bankDebitsDue, reservedCash,
    safeToSpend: input.bank == null ? null : input.bank - billsDue - bankDebitsDue - reservedCash,
    bank: input.bank,
    billsDue,
    salaryExpected,
    until,
    daysLeft,
  };
}
