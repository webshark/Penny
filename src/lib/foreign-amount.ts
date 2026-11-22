/** The original amount of a foreign-currency charge ("$12.50"), or null for shekels or an unknown currency code. */
export function foreignAmount(amount: number, currency: string | null | undefined, locale: string): string | null {
  if (!currency || !/^[A-Z]{3}$/.test(currency) || currency === "ILS" || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return null;
  }
}
