/** Non-monthly expenses (sinking funds): pure math and rule-based detection, no I/O. */

export interface PeriodicExpense {
  id: number;
  name: string;
  amount: number;
  everyMonths: number;
  /** YYYY-MM */
  nextDue: string;
  savedSoFar: number;
  autoKey: string | null;
}

export type PeriodicSuggestion = Omit<PeriodicExpense, "id" | "savedSoFar"> & { autoKey: string };

export interface PeriodicPayload {
  items: PeriodicExpense[];
  suggestions: PeriodicSuggestion[];
}

const idx = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const ym = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
export const shiftMonth = (month: string, n: number) => ym(idx(month) + n);

/** Months left to save, counting the due month itself; at least 1 (a past due date means "this month"). */
export const monthsUntil = (today: string, due: string) => Math.max(1, idx(due) - idx(today.slice(0, 7)) + 1);

export const monthlySetAside = (e: Pick<PeriodicExpense, "amount" | "savedSoFar" | "nextDue">, today: string) =>
  Math.max(0, e.amount - e.savedSoFar) / monthsUntil(today, e.nextDue);

export const totalSetAside = (items: PeriodicExpense[], today: string) =>
  items.reduce((s, e) => s + monthlySetAside(e, today), 0);

/** First due month on or after `today`, stepping by `every` from the last time it was paid. */
export function nextDueFrom(lastPaid: string, every: number, today: string) {
  let due = shiftMonth(lastPaid.slice(0, 7), every);
  while (due < today.slice(0, 7)) due = shiftMonth(due, every);
  return due;
}

export interface Charge {
  description: string;
  /** Positive amount spent. */
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  category: string | null;
}

export interface YearlySeries {
  merchant: string;
  expectedAmount: number;
  lastDate: string;
}

// Israeli bills that come a few times a year. `name` is the default item name the user can edit.
const KEYWORDS: { key: string; name: string; re: RegExp; month?: number }[] = [
  { key: "arnona", name: "ארנונה", re: /ארנונה/ },
  // Billed every two months by most providers, so worth putting aside for monthly.
  { key: "electricity", name: "חשמל", re: /חברת החשמל|חשמל לישראל|israel electric/i },
  { key: "water", name: "מים", re: /(^|[^א-ת])(מי אביבים|מי שבע|מי כרמל|מי רעננה|מי נתניה|הגיחון|תאגיד (ה)?מים|מניב ראשון|מי עירון)(?![א-ת])/ },
  { key: "gas", name: "גז", re: /סופרגז|פזגז|אמישראגז|דורגז/ },
  { key: "car-insurance", name: "ביטוח רכב", re: /ביטוח\s*(רכב|חובה|מקיף)|הראל רכב|ביטוח ישיר רכב/ },
  { key: "car-license", name: "טסט ורישוי רכב", re: /טסט|רישוי|משרד התחבורה|אגרת רכב/ },
  { key: "home-insurance", name: "ביטוח דירה", re: /ביטוח\s*(דירה|מבנה|תכולה)/ },
  { key: "annual-fee", name: "דמי מנוי שנתי", re: /מנוי שנתי|דמי מנוי שנתי/ },
  { key: "fees", name: "אגרות", re: /אגרה|אגרת/ },
  { key: "vaad", name: "ועד בית", re: /ועד בית/ },
  { key: "camp", name: "קייטנה", re: /קייטנ/ },
  { key: "school", name: "חזרה ללימודים", re: /ציוד לימוד|חזרה ללימודים/, month: 8 },
];

const HOLIDAY_CATEGORY = /groceries|supermarket|gift|סופר|מזון|מתנ/i;
const HOLIDAYS = [
  { key: "holidays-tishrei", name: "חגי תשרי", month: 9 },
  { key: "holidays-pesach", name: "פסח", month: 4 },
];

const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * Suggestions from the last 13 months of charges: yearly recurring series, Israeli keywords that show up
 * 1-6 times a year, and September/April supermarket+gift spikes.
 * Keys in `known` (accepted or dismissed) are left out.
 */
// shortcut: keyword list and the 20% holiday spike threshold are guesses; tune them on real statements.
export function detectPeriodic(charges: Charge[], yearly: YearlySeries[], today: string, known: Set<string>): PeriodicSuggestion[] {
  const out: PeriodicSuggestion[] = [];
  const add = (s: PeriodicSuggestion) => {
    if (!known.has(s.autoKey) && s.amount > 0 && !out.some((o) => o.autoKey === s.autoKey)) out.push(s);
  };
  const since = shiftMonth(today.slice(0, 7), -12);
  const recent = charges.filter((c) => c.date.slice(0, 7) >= since && c.date <= today && c.amount > 0);

  for (const s of yearly) {
    // A model's yearly label alone is not evidence of an annual commitment.
    const dates = charges.filter(c => c.description.trim().toLocaleLowerCase() === s.merchant.trim().toLocaleLowerCase() && c.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const annual = dates.some((a, i) => dates.slice(i + 1).some(b => {
      const gap = (Date.parse(b.date) - Date.parse(a.date)) / 86400000;
      return gap >= 330 && gap <= 400 && Math.abs(a.amount - b.amount) / Math.max(a.amount, b.amount) <= 0.25;
    }));
    if (!annual) continue;
    add({ autoKey: `yearly:${s.merchant}`, name: s.merchant, amount: round10(s.expectedAmount), everyMonths: 12, nextDue: nextDueFrom(s.lastDate, 12, today) });
  }

  for (const k of KEYWORDS) {
    const hits = recent.filter((c) => k.re.test(c.description));
    const byMonth = new Map<string, number>();
    for (const h of hits) byMonth.set(h.date.slice(0, 7), (byMonth.get(h.date.slice(0, 7)) ?? 0) + h.amount);
    const n = byMonth.size;
    if (n < 1 || n > 6) continue; // more often than that it is a monthly bill, not a sinking fund
    const months = [...byMonth.keys()].sort();
    const gaps = months.slice(1).map((month, i) => idx(month) - idx(months[i]));
    const interval = gaps.length ? Math.round([...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 12;
    if (!k.month && (interval < 2 || gaps.some(gap => Math.abs(gap - interval) > 1))) continue;
    const every = k.month ? 12 : interval;
    const last = [...byMonth.keys()].sort().at(-1)!;
    const total = [...byMonth.values()].reduce((a, b) => a + b, 0);
    const nextDue = k.month ? nextDueFrom(`${last.slice(0, 4)}-${String(k.month).padStart(2, "0")}`, 12, today) : nextDueFrom(last, every, today);
    add({ autoKey: `kw:${k.key}`, name: k.name, amount: round10(total / n), everyMonths: every, nextDue });
  }

  const holidaySpend = new Map<string, number>();
  for (const c of recent) {
    if (c.category && HOLIDAY_CATEGORY.test(c.category)) holidaySpend.set(c.date.slice(0, 7), (holidaySpend.get(c.date.slice(0, 7)) ?? 0) + c.amount);
  }
  for (const h of HOLIDAYS) {
    const mm = String(h.month).padStart(2, "0");
    const peak = [...holidaySpend].find(([m]) => m.endsWith(`-${mm}`));
    const others = [...holidaySpend].filter(([m]) => !m.endsWith("-09") && !m.endsWith("-04")).map(([, v]) => v).sort((a, b) => a - b);
    if (!peak || others.length < 3) continue;
    const median = others[Math.floor(others.length / 2)];
    const extra = peak[1] - median;
    if (extra > median * 0.2) add({ autoKey: h.key, name: h.name, amount: round10(extra), everyMonths: 12, nextDue: nextDueFrom(peak[0], 12, today) });
  }
  return out;
}
