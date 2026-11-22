export const fmt = (n: number, locale: string, digits = 0) =>
  n.toLocaleString(locale === "he" ? "he-IL" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** ₪ amount; the LTR isolate keeps the sign in front inside Hebrew text. */
export const shekels = (n: number, locale: string) => `⁦${n < 0 ? "−" : ""}₪${fmt(Math.abs(n), locale)}⁩`;

/**
 * Rounds a money value to agorot without float drift: Math.round(1.005 * 100) is 100, not 101,
 * because 1.005 is really 1.00499999… — so half-up rounding silently loses a cent.
 */
export const roundCents = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(12)));
  return (n < 0 ? -1 : 1) * (cents / 100);
};

/** Short ₪ amount (48.7K, 2.7M) in the same shape as `shekels`: sign, ₪, number, kept LTR inside Hebrew text. */
export const compactShekels = (n: number, locale: string) =>
  `⁦${n < 0 ? "−" : ""}₪${new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n)).replace(/[\u200e\u200f]/g, "")}⁩`;

/** Like shekels, with "+" on positive amounts too (income, money left). */
export const signedShekels = (n: number, locale: string, digits = 0) => `⁦${n > 0 ? "+" : n < 0 ? "−" : ""}₪${fmt(Math.abs(n), locale, digits)}⁩`;
