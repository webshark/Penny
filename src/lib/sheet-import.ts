import { parseAmount, parseCsv, toCsv } from "@/lib/csv";
import { markDuplicates, parseHtmlTable, parseImportDate, type DateOrder } from "@/lib/file-import";
import { roundCents } from "@/lib/money";

/**
 * The smart sheet: a paste-anywhere grid that becomes transactions. Pure and tested; the card in
 * Settings owns the editing state, the API owns the writing.
 */
export const SHEET_FIELDS = [
  "date",
  "description",
  "amount",
  "kind",
  "account",
  "category",
  "tags",
  "owner",
  "business",
  "memo",
] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];
export type { DateOrder };
export type SheetMap = Record<SheetField, number | null>;

/** Cap for one paste: a month or two of hand-written rows, not an entire bank history. */
export const MAX_SHEET_ROWS = 500;
export const MAX_SHEET_AMOUNT = 10_000_000;
/** The account that means "I typed this in": manual rows, editable forever. */
export const SHEET_CASH_ACCOUNT = "cash";
export const SHEET_AMOUNT_FIELDS: readonly SheetField[] = ["date", "description", "amount"];

/** Header names the template uses and the paste detector looks for. Most specific first. */
const KEYWORDS: Record<SheetField, string[]> = {
  date: ["תאריך עסקה", "תאריך רכישה", "תאריך תנועה", "תאריך פעולה", "תאריך ערך", "תאריך חיוב", "תאריך", "transaction date", "posting date", "date"],
  description: ["שם בית העסק", "בית עסק", "שם העסק", "תיאור התנועה", "תיאור הפעולה", "תיאור", "תאור", "פרטים", "merchant name", "description", "merchant", "payee", "details"],
  amount: ["סכום חיוב", "סכום עסקה", "סכום התנועה", "סכום", "charge amount", "transaction amount", "amount", "sum"],
  kind: ["סוג תנועה", "סוג", "הוצאה/הכנסה", "type", "kind", "direction"],
  account: ["חשבון", "כרטיס", "אמצעי תשלום", "account", "card", "wallet"],
  category: ["קטגוריה", "סיווג", "category", "class"],
  tags: ["תגיות", "תגית", "תיוג", "tags", "tag", "labels"],
  owner: ["בעלים", "שייך ל", "בן משפחה", "owner", "member"],
  business: ["אחוז עסקי", "אחוז לעסק", "חלק עסקי", "business", "business pct", "business %"],
  memo: ["הערה", "הערות", "פירוט נוסף", "memo", "note", "notes"],
};

/** Every known header word, for spotting a header row and for the mapping bar's labels. */
const HEADER_WORDS: string[] = [...new Set(Object.values(KEYWORDS).flat())];

const norm = (s: string) => s.replace(/[\s"'׳״:*()₪%]+/g, " ").trim().toLowerCase();

function headerHits(row: string[]): number {
  return row.filter((c) => {
    const n = norm(c);
    return n.length > 0 && HEADER_WORDS.some((k) => n === norm(k) || (n.length <= 30 && n.includes(norm(k))));
  }).length;
}

/** First row that looks like a header (at least two known column names) among the first 10, or -1. */
export function findSheetHeader(table: string[][]): number {
  return table.slice(0, 10).findIndex((row) => headerHits(row) >= 2);
}

/** Column mapping from header names; unmatched fields stay null for the mapping bar. */
export function guessSheetColumns(header: string[]): SheetMap {
  const cols = header.map(norm);
  const used = new Set<number>();
  const map = {} as SheetMap;
  for (const f of SHEET_FIELDS) {
    let found: number | null = null;
    for (const k of KEYWORDS[f]) {
      const key = norm(k);
      const exact = cols.findIndex((c, i) => !used.has(i) && c === key);
      const loose =
        exact >= 0
          ? exact
          : cols.findIndex((c, i) => !used.has(i) && c.includes(key) && !c.includes("יתרה") && !c.includes("balance"));
      if (loose >= 0) {
        found = loose;
        break;
      }
    }
    if (found != null) used.add(found);
    map[f] = found;
  }
  return map;
}

/** A pasted block: HTML table from a copied spreadsheet, else CSV/TSV text. */
export function parseSheetPaste(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  const table = /<table/i.test(clean) ? parseHtmlTable(clean) : parseCsv(clean);
  // Blank trailing rows and the single-cell rows Excel adds around a copied block.
  return table.filter((row) => row.some((c) => c.trim() !== ""));
}

const RELATIVE_DAYS: Record<string, number> = {
  today: 0,
  "היום": 0,
  yesterday: -1,
  "אתמול": -1,
  tomorrow: 1,
  "מחר": 1,
};

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * A typed or pasted date: the file importer's formats plus today/yesterday, dd/mm without a year
 * (the current year, or last year when that would land in the future).
 */
export function parseSheetDate(raw: string | undefined, order: DateOrder = "dmy", today = isoOf(Date.now())): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const rel = RELATIVE_DAYS[t.toLowerCase()];
  if (rel !== undefined) return isoOf(dayOf(today) + rel * 86_400_000);
  const direct = parseImportDate(t, order);
  if (direct) return direct;
  const short = /^(\d{1,2})[./-](\d{1,2})$/.exec(t);
  if (!short) return null;
  const day = order === "mdy" ? +short[2] : +short[1];
  const month = order === "mdy" ? +short[1] : +short[2];
  const year = Number(today.slice(0, 4));
  const iso = sheetIso(year, month, day);
  if (iso && iso <= isoOf(dayOf(today) + 14 * 86_400_000)) return iso;
  return sheetIso(year - 1, month, day);
}

function sheetIso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

const EXPENSE_WORDS = ["הוצאה", "הוצאות", "חיוב", "תשלום", "expense", "spend", "debit", "out"];
const INCOME_WORDS = ["הכנסה", "הכנסות", "זכות", "הפקדה", "income", "earning", "credit", "deposit", "in"];

/** "הוצאה" / "expense" / "income" → a kind; anything else (including blank) → null. */
export function parseSheetKind(raw: string | undefined): "expense" | "income" | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (EXPENSE_WORDS.includes(t)) return "expense";
  if (INCOME_WORDS.includes(t)) return "income";
  return null;
}

/** Splits "טיול, משפחה" into clean tags. */
export function parseSheetTags(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(/[,;|]/)
        .map((t) => t.trim().replace(/\s+/g, " ").slice(0, 30))
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

/** One editable row, as typed or pasted. Every cell is text until it is normalised. */
export interface SheetDraft {
  date: string;
  description: string;
  amount: string;
  kind: "" | "expense" | "income";
  account: string;
  category: string;
  tags: string;
  owner: string;
  business: string;
  memo: string;
}

export function emptySheetDraft(defaults: Partial<SheetDraft> = {}): SheetDraft {
  return {
    date: "",
    description: "",
    amount: "",
    kind: "",
    account: "",
    category: "",
    tags: "",
    owner: "",
    business: "",
    memo: "",
    ...defaults,
  };
}

export interface SheetRowValues {
  date: string;
  description: string;
  amount: number;
  kind: "expense" | "income";
  account: string;
  category: string;
  tags: string[];
  owner: string | null;
  businessSharePct: number;
  memo: string | null;
}

export interface SheetError {
  field: SheetField;
  code: "dateRequired" | "dateInvalid" | "descriptionRequired" | "descriptionTooLong" | "amountRequired" | "amountRange" | "businessRange" | "accountRequired";
}

export interface ParsedSheetRow {
  values: SheetRowValues;
  errors: SheetError[];
}

export interface NormalizeOptions {
  dateOrder?: DateOrder;
  /** A single amount column on a card statement lists spending as positive. */
  positiveIsExpense?: boolean;
  /** Default account for rows that leave the column empty. */
  defaultAccount?: string;
  today?: string;
}

/**
 * Text → a transaction row plus the cells that are wrong. Base-currency amounts are absolute;
 * the kind carries direction, so a refund stays an expense on a card statement.
 */
export function normalizeSheetRow(draft: SheetDraft, opts: NormalizeOptions = {}): ParsedSheetRow {
  const errors: SheetError[] = [];
  const dateOrder = opts.dateOrder ?? "dmy";
  const today = opts.today ?? isoOf(Date.now());

  const date = parseSheetDate(draft.date, dateOrder, today);
  if (!draft.date.trim()) errors.push({ field: "date", code: "dateRequired" });
  else if (!date) errors.push({ field: "date", code: "dateInvalid" });
  else if (date < "1990-01-01" || dayOf(date) > dayOf(today) + 366 * 86_400_000) errors.push({ field: "date", code: "dateInvalid" });

  const description = draft.description.replace(/\s+/g, " ").trim();
  if (!description) errors.push({ field: "description", code: "descriptionRequired" });
  else if (description.length > 120) errors.push({ field: "description", code: "descriptionTooLong" });

  const raw = parseAmount(draft.amount);
  const amount = raw == null ? null : roundCents(Math.abs(raw));
  if (raw == null) errors.push({ field: "amount", code: "amountRequired" });
  else if (!amount || amount > MAX_SHEET_AMOUNT) errors.push({ field: "amount", code: "amountRange" });

  const explicitKind = parseSheetKind(draft.kind);
  const kind: "expense" | "income" =
    explicitKind ?? ((raw != null && raw < 0) || (opts.positiveIsExpense ?? true) ? "expense" : "income");

  const business = draft.business.trim() === "" ? 0 : Number(draft.business.replace("%", "").trim());
  if (!Number.isFinite(business) || !Number.isInteger(business) || business < 0 || business > 100) {
    errors.push({ field: "business", code: "businessRange" });
  }

  const account = (draft.account.trim() || opts.defaultAccount?.trim() || "").slice(0, 40);
  if (!account) errors.push({ field: "account", code: "accountRequired" });

  return {
    values: {
      date: date ?? "",
      description,
      amount: amount ?? 0,
      kind,
      account,
      category: draft.category.trim().slice(0, 40),
      tags: parseSheetTags(draft.tags),
      owner: draft.owner.trim() ? draft.owner.trim().slice(0, 40) : null,
      businessSharePct: Number.isFinite(business) ? Math.min(100, Math.max(0, Math.trunc(business))) : 0,
      memo: draft.memo.trim() ? draft.memo.trim().slice(0, 500) : null,
    },
    errors,
  };
}

/** The signed amount a row adds to its account: expenses negative, income positive. */
export const signedSheetAmount = (v: Pick<SheetRowValues, "kind" | "amount">) => (v.kind === "expense" ? -v.amount : v.amount);

/** Drafts from a pasted table, skipping a detected header row. Unmapped cells stay empty. */
export function buildSheetDrafts(table: string[][], map: SheetMap): SheetDraft[] {
  const cell = (row: string[], field: SheetField) => (map[field] == null ? "" : (row[map[field]!] ?? "").trim());
  return table.map((row) =>
    emptySheetDraft({
      date: cell(row, "date"),
      description: cell(row, "description"),
      amount: cell(row, "amount"),
      kind: parseSheetKind(cell(row, "kind")) ?? "",
      account: cell(row, "account"),
      category: cell(row, "category"),
      tags: cell(row, "tags"),
      owner: cell(row, "owner"),
      business: cell(row, "business"),
      memo: cell(row, "memo"),
    }),
  );
}

export interface SheetSummary {
  count: number;
  expenses: number;
  income: number;
  net: number;
  from: string | null;
  to: string | null;
  byAccount: { account: string; count: number; net: number }[];
}

/** Footer totals over the rows that will be saved. */
export function sheetSummary(rows: Pick<SheetRowValues, "account" | "date" | "kind" | "amount">[]): SheetSummary {
  let expenses = 0;
  let income = 0;
  let from: string | null = null;
  let to: string | null = null;
  const accounts = new Map<string, { count: number; net: number }>();
  for (const r of rows) {
    const signed = signedSheetAmount(r);
    if (r.kind === "expense") expenses += r.amount;
    else income += r.amount;
    if (r.date) {
      if (!from || r.date < from) from = r.date;
      if (!to || r.date > to) to = r.date;
    }
    const a = accounts.get(r.account) ?? { count: 0, net: 0 };
    a.count += 1;
    a.net = roundCents(a.net + signed);
    accounts.set(r.account, a);
  }
  return {
    count: rows.length,
    expenses: roundCents(expenses),
    income: roundCents(income),
    net: roundCents(income - expenses),
    from,
    to,
    byAccount: [...accounts.entries()]
      .map(([account, v]) => ({ account, ...v }))
      .sort((x, y) => y.count - x.count),
  };
}

export interface DuplicateCheck {
  duplicate: boolean;
  /** The same row appears twice in the sheet; still saved, but the user should look. */
  repeated: boolean;
}

/**
 * Which rows already exist for their account. A stored row matches one sheet row with the same
 * amount dated within a day, so two real coffees both survive; identical rows inside the paste
 * are flagged as repeats instead of being silently dropped.
 */
export function markSheetDuplicates(
  rows: Pick<SheetRowValues, "account" | "date" | "kind" | "amount" | "description">[],
  storedFor: (account: string) => { date: string; amount: number }[],
): DuplicateCheck[] {
  const byAccount = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const list = byAccount.get(r.account) ?? [];
    list.push(i);
    byAccount.set(r.account, list);
  });
  const out: DuplicateCheck[] = rows.map(() => ({ duplicate: false, repeated: false }));
  for (const [account, indexes] of byAccount) {
    const mine = indexes.map((i) => ({
      date: rows[i].date,
      description: rows[i].description,
      amount: signedSheetAmount(rows[i]),
    }));
    const marked = markDuplicates(mine, storedFor(account));
    indexes.forEach((rowIndex, k) => {
      out[rowIndex].duplicate = marked[k].duplicate;
    });
  }
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const key = `${r.account}|${r.date}|${r.description}|${signedSheetAmount(r)}`;
    if (seen.has(key)) out[i].repeated = true;
    seen.add(key);
  });
  return out;
}

/** The header row of the downloadable template and the copy-header button. */
export const SHEET_TEMPLATE_HEADER = ["תאריך", "תיאור", "סכום", "סוג", "חשבון", "קטגוריה", "תגיות", "בעלים", "אחוז עסקי", "הערה"];

/** CSV template: the header plus one example row that explains the format. */
export function sheetTemplateCsv(): string {
  return `${toCsv([
    SHEET_TEMPLATE_HEADER,
    ["05/03/2024", "סופר", "84.90", "הוצאה", "cash", "אוכל", "משפחה", "shared", "0", "קניות שבועיות"],
    ["10/03/2024", "משכורת", "12000", "הכנסה", "חשבון הפועלים", "משכורת", "", "shared", "0", ""],
  ])}\r\n`;
}

/** Whether a pasted block needs the mapping bar: no header found, so nothing was guessed. */
export function needsMapping(map: SheetMap): boolean {
  return map.date == null || map.description == null || map.amount == null;
}
