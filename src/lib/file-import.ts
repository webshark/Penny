import { decodeStatementText, parseAmount, parseCsv, sniffFileKind } from "@/lib/csv";
import { roundCents } from "@/lib/money";
import { readXlsx } from "@/lib/xlsx";

/** Bank / credit-card statement import: header detection, column mapping and row parsing. */
export const IMPORT_FIELDS = ["date", "description", "amount", "debit", "credit"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportMap = Record<ImportField, number | null>;
export interface ImportRow { date: string; description: string; amount: number }
export const MAX_IMPORT_ROWS = 5000;

// Most specific first: the first keyword that matches a column wins for that field.
const KEYWORDS: Record<ImportField, string[]> = {
  date: ["תאריך עסקה", "תאריך רכישה", "תאריך תנועה", "תאריך פעולה", "תאריך", "תאריך ערך", "תאריך חיוב", "transaction date", "posting date", "date"],
  description: ["שם בית העסק", "בית עסק", "שם בית עסק", "שם העסק", "תיאור התנועה", "תאור התנועה", "תיאור הפעולה", "פרטי התנועה", "תיאור", "תאור", "פרטים", "merchant name", "description", "merchant", "payee", "details"],
  amount: ["סכום חיוב", "סכום החיוב", "סכום עסקה", "סכום העסקה", "סכום התנועה", "סכום", "charge amount", "transaction amount", "amount"],
  debit: ["חובה", "בחובה", "חיוב", "debit", "withdrawal"],
  credit: ["זכות", "בזכות", "credit", "deposit"],
};
const HEADER_WORDS = [...Object.values(KEYWORDS).flat(), "יתרה", "balance"];

const norm = (s: string) => s.replace(/[\s"'׳״:*()₪]+/g, " ").trim().toLowerCase();

const headerHits = (row: string[]) =>
  row.filter((c) => {
    const n = norm(c);
    return n && HEADER_WORDS.some((k) => n === k || (n.length <= 30 && n.includes(k)));
  }).length;

/** Index of the first header row (at least 2 known column names) among the first 30, or -1. Later sections have their own header. */
export function findHeaderRow(table: string[][]): number {
  return table.slice(0, 30).findIndex((row) => headerHits(row) >= 2);
}

export function guessColumns(header: string[]): ImportMap {
  const cols = header.map(norm);
  const used = new Set<number>();
  const map = {} as ImportMap;
  for (const f of IMPORT_FIELDS) {
    let found: number | null = null;
    for (const k of KEYWORDS[f]) {
      const exact = cols.findIndex((c, i) => !used.has(i) && c === k);
      const loose = exact >= 0 ? exact : cols.findIndex((c, i) => !used.has(i) && c.includes(k) && !c.includes("יתרה"));
      if (loose >= 0) { found = loose; break; }
    }
    if (found != null) used.add(found);
    map[f] = found;
  }
  // "סכום חובה" style headers: separate debit/credit columns win over a single amount.
  if (map.debit != null && map.credit != null && map.amount != null && [map.debit, map.credit].includes(map.amount)) map.amount = null;
  return map;
}

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

export type DateOrder = "dmy" | "mdy";

/**
 * dd/mm/yyyy, dd.mm.yy, dd-mm-yyyy, yyyy-mm-dd, mm/dd/yyyy (with `order`) or an Excel date
 * serial -> "yyyy-mm-dd", or null.
 */
export function parseImportDate(s: string | undefined, order: DateOrder = "dmy"): string | null {
  const t = (s ?? "").trim();
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Math.floor(Number(t));
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/.exec(t);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return order === "mdy" ? iso(y, +m[1], +m[2]) : iso(y, +m[2], +m[1]);
}

/**
 * Whether a file lists dates day-first or month-first. A value above 12 in the first position
 * proves day-first; above 12 in the second proves month-first.
 */
export function detectDateOrder(values: string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/.exec(value.trim());
    if (!m) continue;
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (first === second) continue;
    if (first > 12) dmy++;
    else if (second > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/** Raw amounts in a column, before any sign convention is applied. */
export function scanAmounts(body: string[][], map: ImportMap): number[] {
  const col = map.amount ?? map.debit ?? map.credit;
  const out: number[] = [];
  if (col == null) return out;
  for (const row of body) {
    const n = parseAmount(row[col]);
    if (n != null && n !== 0) out.push(n);
  }
  return out;
}

/**
 * Card statements list charges as positive; bank statements list them as negative. If the file has
 * any negative amount, spending is negative and positive values are incomes or refunds.
 */
export function inferPositiveIsExpense(amounts: number[]): boolean {
  return !amounts.some((n) => n < 0);
}

/** Fallback when no row looks like a header: the first row with at least two non-empty cells. */
export function fallbackHeaderRow(table: string[][]): number {
  const i = table.findIndex((row) => row.filter((c) => c.trim() !== "").length >= 2);
  return i >= 0 ? i : 0;
}

/**
 * Turns body rows into transactions (negative = money out). A single amount column on a card
 * statement lists spending as positive, so `positiveIsExpense` flips it. A later header row
 * (card exports list domestic, then abroad, each with its own header) re-maps the columns below it.
 */
export function buildImportRows(body: string[][], map: ImportMap, positiveIsExpense: boolean, dateOrder: DateOrder = "dmy"): { rows: ImportRow[]; skipped: number } {
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of body) {
    if (headerHits(r) >= 2) { map = guessColumns(r); continue; }
    const date = map.date == null ? null : parseImportDate(r[map.date], dateOrder);
    const description = map.description == null ? "" : (r[map.description] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    let amount: number | null = null;
    if (map.amount != null) {
      const a = parseAmount(r[map.amount]);
      amount = a == null ? null : positiveIsExpense ? -a : a;
    } else if (map.debit != null || map.credit != null) {
      const d = map.debit == null ? null : parseAmount(r[map.debit]);
      const c = map.credit == null ? null : parseAmount(r[map.credit]);
      amount = d == null && c == null ? null : (c ?? 0) - Math.abs(d ?? 0);
    }
    if (!date || !description || amount == null || amount === 0) { skipped++; continue; }
    rows.push({ date, description, amount: roundCents(amount) });
  }
  return { rows, skipped };
}

export const importKey = (r: ImportRow) => `${r.date}|${r.amount}|${r.description}`;

/**
 * Marks rows already stored for this account, whether a bank sync or an earlier file stored them.
 * A stored row matches a file row with the same amount dated within a day (banks and exports often
 * differ by a day and in the description text); each stored row matches at most one file row, so two
 * real coffees both survive. `seq` numbers identical rows in the file (for dedup_sequence).
 */
export function markDuplicates(rows: ImportRow[], stored: { date: string; amount: number }[]) {
  const day = (d: string) => Date.parse(d.slice(0, 10)) / 86_400_000;
  const pool = stored.map((r) => ({ day: day(r.date), amount: r.amount, used: false }));
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const k = importKey(r);
    const seq = (seen.get(k) ?? 0) + 1;
    seen.set(k, seq);
    const d = day(r.date);
    let best: (typeof pool)[number] | undefined;
    for (const p of pool) {
      if (p.used || p.amount !== r.amount || Math.abs(p.day - d) > 1) continue;
      if (!best || Math.abs(p.day - d) < Math.abs(best.day - d)) best = p;
    }
    if (best) best.used = true;
    return { ...r, seq, duplicate: best !== undefined };
  });
}

/**
 * Rows of every <table> in an HTML page. Some Israeli banks download "Excel" files that are
 * really HTML tables saved with an .xls name.
 */
// shortcut: regex parsing, no nested tables or rowspan; fine for bank exports, switch to DOMParser if one breaks.
export function parseHtmlTable(html: string): string[][] {
  const text = (s: string) =>
    s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
      .replace(/\s+/g, " ").trim();
  const rows: string[][] = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: string[] = [];
    for (const td of tr[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      row.push(text(td[3]));
      for (let k = Number(/colspan="?(\d+)/i.exec(td[2])?.[1] ?? 1); k > 1; k--) row.push("");
    }
    if (row.some((c) => c)) rows.push(row);
  }
  return rows;
}

/** The file types the reader below understands; the import guide's table and the file picker come from this list. */
export const IMPORT_FORMATS = [
  { ext: ".csv", label: "CSV", note: "csv" },
  { ext: ".xlsx", label: "Excel (xlsx)", note: "xlsx" },
  { ext: ".xls", label: "Excel (xls)", note: "xls" },
] as const;
export const IMPORT_EXTS: readonly string[] = IMPORT_FORMATS.map((f) => f.ext);

/** Raw rows of a statement file. Throws "pdf"/"xlsNotSupported" for formats that need converting. */
export async function readStatementTable(bytes: Uint8Array, name: string): Promise<string[][]> {
  // Names lie: some .xls downloads are really .xlsx, and some "Excel" files are HTML tables.
  const kind = sniffFileKind(bytes);
  if (kind === "xlsx") return readXlsx(bytes);
  if (kind === "pdf") throw new Error("pdf");
  // Israeli bank CSVs are often UTF-16 (Excel "Unicode text") or Windows-1255, not UTF-8.
  const text = decodeStatementText(bytes);
  if (/<table/i.test(text)) return parseHtmlTable(text);
  if (kind === "xls" || name.toLowerCase().endsWith(".xls")) throw new Error("xlsNotSupported");
  return parseCsv(text);
}

export interface StatementImport {
  rows: ImportRow[];
  skipped: number;
  /** Card statements read their own sign; "bank" keeps it, so a refund stays an expense. */
  source: "bank" | "card";
}

/** File → transactions with the auto-detected columns (the unattended folder import). Throws "noHeader". */
export async function statementRows(bytes: Uint8Array, name: string): Promise<StatementImport> {
  const table = await readStatementTable(bytes, name);
  const h = findHeaderRow(table);
  if (h < 0) throw new Error("noHeader");
  const map = guessColumns(table[h]);
  const body = table.slice(h + 1);
  const dates = map.date == null ? [] : body.map((r) => r[map.date!] ?? "");
  const positiveIsExpense = inferPositiveIsExpense(scanAmounts(body, map));
  const { rows, skipped } = buildImportRows(body, map, positiveIsExpense, detectDateOrder(dates));
  return { rows, skipped, source: positiveIsExpense ? "card" : "bank" };
}
