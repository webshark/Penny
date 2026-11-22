/** Minimal CSV parser: quoted fields, escaped quotes, CRLF, and , ; tab | delimiters (picked from the body). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) count++;
  }
  return count;
}

/**
 * Picks the delimiter that splits the most lines the same way. Statement files often start with
 * a title line ("דוח תנועות, ינואר") that would win a first-line-only check.
 */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, 12);
  let best = ",";
  let bestScore = -1;
  for (const delimiter of [",", ";", "\t", "|"]) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter)).filter((n) => n > 0);
    if (counts.length === 0) continue;
    const freq = new Map<number, number>();
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
    let mode = 0;
    let modeCount = 0;
    for (const [n, seen] of freq) {
      if (seen > modeCount || (seen === modeCount && n > mode)) {
        mode = n;
        modeCount = seen;
      }
    }
    const score = modeCount * 100 + Math.min(mode, 20);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** Serialize rows to RFC 4180 CSV (CRLF line endings, quotes doubled). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell == null ? "" : String(cell);
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(",")
    )
    .join("\r\n");
}

/**
 * "₪1,234.50" / "1 234,5" / "1.234.567" / "(12)" / "12.50-" -> number, or null.
 * Trailing minus (common in Israeli card exports) and grouped thousands are handled; a lone
 * separator with 1–2 digits after it is a decimal separator.
 */
export function parseAmount(s: string | undefined): number | null {
  if (!s) return null;
  let t = s.replace(/\u2212/g, "-").replace(/[^\d.,()\-]/g, "");
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || (t.match(/-/g)?.length ?? 0) % 2 === 1;
  t = t.replace(/[()\-]/g, "");
  if (!/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // The rightmost separator is the decimal one; the other groups thousands.
    t =
      lastComma > lastDot
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = t.split(",");
    const decimals = parts[parts.length - 1].length;
    t = parts.length === 2 && decimals <= 2 ? `${parts[0]}.${parts[1]}` : t.replace(/,/g, "");
  } else if ((t.match(/\./g)?.length ?? 0) > 1) {
    // "1.234.567": dots group thousands, the last group must be three digits.
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return t && Number.isFinite(n) ? (negative ? -n : n) : null;
}

/**
 * Decodes a statement file. Israeli banks export UTF-16 ("Unicode text" from Excel),
 * Windows-1255 and UTF-8; all three appear in practice.
 */
export function decodeStatementText(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length === 0) return "";
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(b.subarray(3));
  }
  // UTF-16 without a BOM: the high byte of every code unit is 0 for ASCII and < 0x09 for Hebrew.
  const sample = b.subarray(0, Math.min(b.length, 4096));
  let odd = 0;
  let high = 0;
  for (let i = 1; i < sample.length; i += 2) {
    odd++;
    if (sample[i] === 0 || sample[i] < 0x09) high++;
  }
  if (odd > 0 && high / odd > 0.6) {
    return new TextDecoder("utf-16le").decode(b);
  }
  const utf8 = new TextDecoder("utf-8").decode(b);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("windows-1255").decode(b);
  } catch {
    return utf8;
  }
}

export type StatementFileKind = "xlsx" | "xls" | "pdf" | "text";

/** Content sniffing: banks happily name an .xls/.pdf file ".csv", so trust the bytes. */
export function sniffFileKind(bytes: ArrayBuffer | Uint8Array): StatementFileKind {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x50 && b[1] === 0x4b) return "xlsx";
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "xls";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  return "text";
}
