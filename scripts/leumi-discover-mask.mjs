// Turns captured bank traffic into its shape. People (and an AI) read the output, so no value may
// survive: letters become a / A / א, digits become 9, and only punctuation and length are kept.

const MAX = 32;

// A date sent as bare digits is ambiguous once masked, so its layout is named instead. No digit is kept.
const digitDate = (t) =>
  /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(t) ? "date:YYYYMMDD"
  : /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}$/.test(t) ? "date:DDMMYYYY"
  : null;

/** "שכר 12,345.60 ACME" -> "אאא 99,999.99 AAAA". Longer text is cut and its length noted. */
export function maskText(s, max = MAX) {
  const t = String(s);
  const date = digitDate(t);
  if (date) return date;
  const masked = Array.from(t.slice(0, max), (ch) => {
    if (/\p{N}/u.test(ch)) return "9";
    if (/[A-Z]/.test(ch)) return "A";
    if (/[a-z]/.test(ch)) return "a";
    if (/\p{L}/u.test(ch)) return "א";
    return /[\x20-\x7E]/.test(ch) ? ch : "?";
  }).join("");
  return t.length > max ? `${masked}…(${t.length})` : masked;
}

/** Page titles say which screen this is, so letters stay; digits (account numbers) do not. */
export const maskTitle = (t) => String(t).replace(/\p{N}/gu, "9").slice(0, 120);

/** A field name like "historyILSTrxItems" stays. A key that is itself data (an account number, a date, Hebrew) is masked. */
export function maskKey(k) {
  const safe = /^[\x21-\x7E]{1,40}$/.test(k) && /[A-Za-z]/.test(k) && !/\d{3,}/.test(k) && !k.includes("@");
  return safe ? k : `~${maskText(k)}`;
}

const isArr = (x) => x !== null && typeof x === "object" && "[]" in x;
const isAlt = (x) => x !== null && typeof x === "object" && "anyOf" in x;
const isObj = (x) => x !== null && typeof x === "object" && !isArr(x) && !isAlt(x);

/** Union of two shapes: object keys are merged, differing leaves are kept as up to 4 alternatives. */
export function merge(a, b) {
  if (a === undefined) return b;
  if (isArr(a) && isArr(b)) return { "[]": Math.max(a["[]"], b["[]"]), item: merge(a.item, b.item) };
  if (isObj(a) && isObj(b)) {
    const out = { ...a };
    for (const [k, x] of Object.entries(b)) out[k] = k in out ? merge(out[k], x) : x;
    return out;
  }
  const alts = (x) => (isAlt(x) ? x.anyOf : [x]);
  const variants = [...new Set([...alts(a), ...alts(b)].map((x) => JSON.stringify(x)))].slice(0, 4).map((x) => JSON.parse(x));
  return variants.length === 1 ? variants[0] : { anyOf: variants };
}

// Switches a request sends (true, false, null, a 1-2 digit number such as periodType=1) are kept as they are.
const SMALL = /^(true|false|null|\d{1,2})$/;

// Which currency a row or account is in is not personal, and a scraper cannot do without it: these fields keep
// their value when it is short. An amount never ends in Code / Name / Symbol, so none can slip through.
const CODE_KEY = /^(currency|ccy|foreignAccountType)$|currency(Code|Name|Symbol|Desc\w*|Id)$/i;
const isCode = (k, v) =>
  CODE_KEY.test(k) && ((typeof v === "string" && v.length <= 20 && !/\d{4,}/.test(v)) || (Number.isInteger(v) && Math.abs(v) < 1000));

/**
 * JSON value -> its shape, with every leaf masked. Arrays collapse to one merged item shape.
 * `keepSmall` is for requests the site sends: their switches are what a scraper has to reproduce.
 * @returns {any}
 */
export function shapeOf(v, depth = 0, keepSmall = false) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return keepSmall ? `boolean:${v}` : "boolean";
  if (typeof v === "number") return `number:${keepSmall && SMALL.test(String(v)) ? v : maskText(String(v))}`;
  if (typeof v === "string") return `string:${keepSmall && SMALL.test(v) ? v : maskText(v)}`;
  if (depth > 10) return "…";
  if (Array.isArray(v)) {
    return { "[]": v.length, item: v.slice(0, 200).map((x) => shapeOf(x, depth + 1, keepSmall)).reduce(merge, undefined) ?? "empty" };
  }
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const key = maskKey(k);
    const s = isCode(k, x) ? `${typeof x}:${x}` : shapeOf(x, depth + 1, keepSmall);
    out[key] = key in out ? merge(out[key], s) : s;
  }
  return out;
}

/**
 * The body of a request the site sent. During sign-in only field names and types are kept, so not even
 * a password's pattern is recorded; elsewhere values are masked like a response, with switches kept.
 */
export function maskRequestBody(body, signIn) {
  let json;
  try { json = JSON.parse(body); } catch { /* not json */ }
  if (json !== undefined && json !== null && typeof json === "object") return signIn ? typesOnly(json) : shapeOf(json, 0, true);
  if (/^[^=&\s]+=/.test(body)) {
    const form = {};
    for (const [k, v] of new URLSearchParams(body)) form[maskKey(k)] = signIn ? "string" : SMALL.test(v) ? v : maskText(v);
    return { form };
  }
  return "not json";
}

/** Like shapeOf but leaves are only type names. For request bodies, where even a masked password pattern is too much. */
export function typesOnly(v, depth = 0) {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return typeof v;
  if (depth > 10) return "…";
  if (Array.isArray(v)) return { "[]": v.length, item: v.slice(0, 200).map((x) => typesOnly(x, depth + 1)).reduce(merge, undefined) ?? "empty" };
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const key = maskKey(k);
    const s = typesOnly(x, depth + 1);
    out[key] = key in out ? merge(out[key], s) : s;
  }
  return out;
}

// A path part that holds an id (long digits, a uuid, a token, Hebrew) is masked; route names stay.
function maskSegment(s) {
  let d = s;
  try { d = decodeURIComponent(s); } catch { /* keep the raw text */ }
  // Lower-case words joined by hyphens ("foreign-transactions.json") are a page name however long; a token is not.
  if (/^[a-z]+(-[a-z]+)+(\.[a-z]{2,4})?$/.test(d) && d.length <= 60) return d;
  return /\d{4,}/.test(d) || d.length >= 24 || /[^\x21-\x7E]/.test(d) ? maskText(d) : d;
}

// "#/ts/Page?x=1" is a screen route and stays (query values dropped). "#ts=<token>" keeps only the name "ts".
function maskHash(h) {
  if (h.startsWith("#/")) {
    const [route, query = ""] = h.slice(1).split("?");
    const out = { route: route.split("/").map(maskSegment).join("/") };
    const keys = [...new URLSearchParams(query).keys()].map(maskKey);
    if (keys.length) out.queryKeys = keys;
    return out;
  }
  const named = /^#([A-Za-z_]{1,16})=/.exec(h);
  return named ? { key: named[1], dropped: true } : { dropped: true };
}

/**
 * URL -> host, masked path, query names with masked values (only true/false/null and 1-2 digit numbers stay), no hash values.
 * @param {string} u
 * @returns {{ host?: string, path?: string, query?: Record<string, string>, hash?: object, invalid?: boolean }}
 */
export function maskUrl(u) {
  let url;
  try { url = new URL(u); } catch { return { invalid: true }; }
  const out = { host: url.host, path: url.pathname.split("/").map(maskSegment).join("/") };
  const query = {};
  for (const [k, v] of url.searchParams) query[maskKey(k)] = SMALL.test(v) || isCode(k, v) ? v : maskText(v);
  if (Object.keys(query).length) out.query = query;
  if (url.hash.length > 1) out.hash = maskHash(url.hash);
  return out;
}
