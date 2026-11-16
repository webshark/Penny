// Scrubs things that must never reach a log line or a cloud AI prompt.
// Order matters: secrets that contain digits go before the generic number rules.
const KEYS = "password|pass|otp|token|apiKey|api_key|id|userCode|card6Digits|cardSuffix|num";
const RULES: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[key]"], // Anthropic / OpenAI style API keys
  [/\b\d{6,}:[A-Za-z0-9_-]{30,}/g, "[token]"], // Telegram bot tokens
  [/\b(bearer|authorization)\b\s*[:=]?\s*\S+/gi, "$1 [redacted]"],
  [new RegExp(`"(${KEYS})"\\s*:\\s*"[^"]*"`, "gi"), '"$1":"[redacted]"'],
  [new RegExp(`\\b(${KEYS})\\s*=\\s*[^\\s&]+`, "gi"), "$1=[redacted]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b\d{4}(?:[ -]\d{4}){2,3}\b/g, "[number]"], // card numbers written in groups
  [/\b\d{5,}\b/g, "[number]"], // ID, account and card digits; dates and amounts stay
];

export function redact(text: string): string {
  return RULES.reduce((out, [re, rep]) => out.replace(re, rep), text);
}

/**
 * For error text that comes from a scraper library. Such text can embed the whole login request under field
 * names no key list knows: israeli-bank-scrapers' fetchPostWithinPage puts `data: {..."Sisma":"<password>"}`
 * in its parse-error message. So this removes the credential values themselves (raw, JSON-escaped and
 * URL-encoded) and every JSON string value, whatever its key, before the usual rules.
 */
export function redactScraperError(text: string, secrets: readonly unknown[] = []): string {
  let out = text;
  for (const secret of secrets) {
    // ponytail: values under 4 characters are skipped so a "1" does not shred the message; a real password is longer.
    if (typeof secret !== "string" || secret.length < 4) continue;
    for (const form of new Set([secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)])) {
      out = out.split(form).join("[redacted]");
    }
  }
  // ponytail: string values only; arrays of strings pass through. Extend if a library ever dumps one.
  return redact(out.replace(/"((?:[^"\\]|\\.)*)"\s*:\s*"(?:[^"\\]|\\.)*"/g, '"$1":"[redacted]"'));
}

/** Error -> short, redacted string. Stack traces are dropped: some libraries put request bodies in them. */
export function redactError(err: unknown): string {
  return redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
}
