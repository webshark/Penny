/** "Ask your money": a small rule-based Hebrew/English question parser. No AI. */

import { budgetMonthByKey, budgetMonthRange, shiftBudgetMonthKey } from "./finance-period";

export type AskIntent = "spent" | "income" | "biggest" | "untilPayday" | "subscriptions" | "savings";

export interface AskPeriod {
  /** Inclusive ISO dates. */
  from: string;
  to: string;
  /** True when the question named the period (otherwise a default was used). */
  explicit: boolean;
}

export interface ParsedQuestion {
  intent: AskIntent | null;
  categoryId?: number;
  merchant?: string;
  period: AskPeriod;
}

export interface AskCategory {
  id: number;
  /** Raw name plus its Hebrew and English translations. */
  names: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The first household month of the quarter holding `key`. */
const quarterStartKey = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return `${year}-${pad(Math.floor((month - 1) / 3) * 3 + 1)}`;
};

const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Lowercase, drop punctuation and Hebrew geresh/maqaf so "ב-3" reads as "ב 3". */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[?!.,:;"'׳״()\-־–]/g, " ").replace(/\s+/g, " ").trim();
}

/** A word plus forms without one or two Hebrew prefix letters ("לוולט" → "וולט") and without a plural ending. */
export function variants(word: string): string[] {
  const forms = [word];
  if (/^[הלבשומכ]/.test(word) && word.length > 3) forms.push(word.slice(1));
  if (/^[הלבשומכ]{2}/.test(word) && word.length > 4) forms.push(word.slice(2));
  for (const w of [...forms]) {
    if (/(ים|ות)$/.test(w) && w.length > 4) forms.push(w.slice(0, -2));
    if (/[a-z]s$/.test(w) && w.length > 3) forms.push(w.slice(0, -1));
  }
  return [...new Set(forms)];
}

/**
 * The period a question means, in household months that start on `startDay` (1 for calendar
 * months), so "last month" is the same range the budget screen uses.
 */
export function parsePeriod(q: string, today: Date, startDay = 1): AskPeriod {
  const t = iso(today);
  const current = budgetMonthRange(startDay, t);
  const key = current.key;
  const year = Number(key.slice(0, 4));
  const monthIndex = Number(key.slice(5, 7)) - 1;
  const lastN = q.match(/(\d+)\s*(?:החודשים|חודשים|months)/);
  if (lastN) {
    const n = Math.max(1, Math.min(36, Number(lastN[1])));
    return { from: budgetMonthRange(startDay, t, -(n - 1)).from, to: t, explicit: true };
  }
  if (/היום|today/.test(q)) return { from: t, to: t, explicit: true };
  if (/השבוע|this week/.test(q)) return { from: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())), to: t, explicit: true };
  if (/חודש שעבר|החודש הקודם|last month|previous month/.test(q)) {
    const previous = budgetMonthRange(startDay, t, -1);
    return { from: previous.from, to: previous.to, explicit: true };
  }
  if (/רבעון שעבר|הרבעון הקודם|last quarter/.test(q)) {
    const start = quarterStartKey(key);
    return {
      from: budgetMonthByKey(startDay, shiftBudgetMonthKey(start, -3)).from,
      to: budgetMonthByKey(startDay, shiftBudgetMonthKey(start, -1)).to,
      explicit: true,
    };
  }
  if (/רבעון|quarter/.test(q)) return { from: budgetMonthByKey(startDay, quarterStartKey(key)).from, to: t, explicit: true };
  if (/שנה שעברה|השנה הקודמת|last year/.test(q)) {
    return {
      from: budgetMonthByKey(startDay, `${year - 1}-01`).from,
      to: budgetMonthByKey(startDay, `${year - 1}-12`).to,
      explicit: true,
    };
  }
  if (/השנה|this year|year to date/.test(q)) return { from: budgetMonthByKey(startDay, `${year}-01`).from, to: t, explicit: true };
  const words = q.split(" ");
  for (let i = 0; i < 12; i++) {
    if (words.some((w) => variants(w).includes(HE_MONTHS[i])) || words.includes(EN_MONTHS[i])) {
      const named = `${i <= monthIndex ? year : year - 1}-${pad(i + 1)}`;
      const range = budgetMonthByKey(startDay, named);
      return { from: range.from, to: named === key ? t : range.to, explicit: true };
    }
  }
  if (/החודש|this month/.test(q)) return { from: current.from, to: t, explicit: true };
  return { from: current.from, to: t, explicit: false };
}

function parseIntent(q: string): AskIntent | null {
  if (/מנוי|subscription/.test(q)) return "subscriptions";
  if (/משכורת|payday|paycheck|salary/.test(q) && /נשאר|left|until|עד/.test(q)) return "untilPayday";
  if (/חוסכ|חוסך|חיסכון|חסכתי|saving|save/.test(q)) return "savings";
  if (/הכי גדול|הגדולה|הגדול ביותר|biggest|largest/.test(q)) return "biggest";
  if (/נכנס|הכנסה|הכנסות|הרווחתי|קיבלתי|income|earn/.test(q)) return "income";
  if (/הוצאתי|שילמתי|הוצאה|הוצאות|בזבזתי|spen[dt]|pay|paid|cost/.test(q)) return "spent";
  return null;
}

// Words that never name a category or merchant.
const STOP = new Set(
  "כמה מה מתי איך אני לי שלי שלך על את זה הזה הזאת היה היו עד יותר הכי בחודש החודש חודש שעבר השנה שנה שעברה השבוע היום רבעון הרבעון הקודם האחרונים חודשים הוצאתי שילמתי הוצאה הוצאות נכנס הכנסה ההוצאה גדולה גדול נשאר how much what did i on at for in the this last my spend spent pay paid month year week today quarter".split(" ")
);

/** Parse a question. `descriptions` are the workspace's transaction descriptions, used for merchant matching. */
export function parseQuestion(
  question: string,
  today: Date,
  categories: AskCategory[],
  descriptions: string[],
  startDay = 1
): ParsedQuestion {
  const q = normalize(question);
  const period = parsePeriod(q, today, startDay);
  let intent = parseIntent(q);
  const words = q.split(" ").filter((w) => !STOP.has(w) && !/^\d+$/.test(w));
  const result: ParsedQuestion = { intent, period };
  if (intent && intent !== "spent" && intent !== "income" && intent !== "biggest") return result;

  const catForms = categories.map((c) => ({ id: c.id, forms: new Set(c.names.flatMap((n) => [normalize(n), ...normalize(n).split(" ").filter((w) => w.length >= 3)]).flatMap(variants)) }));
  for (const w of words) {
    const hit = catForms.find((c) => variants(w).some((v) => v.length >= 3 && c.forms.has(v)));
    if (hit) {
      result.categoryId = hit.id;
      break;
    }
  }
  if (result.categoryId == null) {
    const lower = descriptions.map((d) => d.toLowerCase());
    outer: for (const w of words) {
      // Longest form first, so "לוולט" tries "לוולט" before "וולט".
      for (const v of variants(w).filter((v) => v.length >= 3).sort((a, b) => b.length - a.length)) {
        if (lower.some((d) => d.includes(v))) {
          result.merchant = v;
          break outer;
        }
      }
    }
  }
  if (!intent && (result.categoryId != null || result.merchant)) intent = "spent";
  return { ...result, intent };
}

/** "בין 1 ל-31 באוקטובר" / "between Oct 1 and Oct 31". */
export function periodLabel(p: { from: string; to: string }, locale: string): string {
  const d = (s: string) => new Date(`${s}T12:00:00`);
  const a = d(p.from);
  const b = d(p.to);
  const sameYear = a.getFullYear() === b.getFullYear();
  if (locale === "he") {
    const yr = (x: Date) => (sameYear ? "" : ` ${x.getFullYear()}`);
    if (p.from === p.to) return `ב-${a.getDate()} ב${HE_MONTHS[a.getMonth()]}`;
    if (sameYear && a.getMonth() === b.getMonth()) return `בין ${a.getDate()} ל-${b.getDate()} ב${HE_MONTHS[a.getMonth()]}`;
    return `בין ${a.getDate()} ב${HE_MONTHS[a.getMonth()]}${yr(a)} ל-${b.getDate()} ב${HE_MONTHS[b.getMonth()]}${yr(b)}`;
  }
  const f = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  return p.from === p.to ? `on ${f(a)}` : `between ${f(a)} and ${f(b)}`;
}

/** Typed text that looks like a question rather than a page name. */
export function looksLikeQuestion(text: string): boolean {
  const s = text.trim();
  return s.length > 3 && (/[?？]$/.test(s) || /^(כמה|מה|מתי|איך|האם|how|what|when|did)\s/i.test(s));
}

/** What POST /api/ask returns: one sentence first, then the numbers and up to 5 rows. */
export interface AskAnswer {
  source: "rules" | "ai" | "none";
  sentence: string;
  period?: string;
  numbers: { label: string; value: string }[];
  rows: { date: string; label: string; amount: string }[];
  link?: { href: string; label: string };
  examples?: string[];
}
