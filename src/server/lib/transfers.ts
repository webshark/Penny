import "server-only";

import type { BankProvider } from "@/lib/types";

export type TransactionKind = "expense" | "income" | "transfer";

const BANK_PROVIDERS_SET: ReadonlySet<BankProvider> = new Set<BankProvider>([
  "hapoalim",
  "leumi",
  "mizrahi",
  "discount",
  "mercantile",
  "beinleumi",
  "otsarHahayal",
  "pagi",
  "yahav",
  "massad",
  "union",
  "oneZero",
  "openBanking",
]);

export const CREDIT_CARD_PAYMENT_PATTERNS: readonly RegExp[] = [
  /ויזה/i,
  /ישראכרט/i,
  /ישרא[\s־-]?כארד/i,
  // Match כאל / כ.א.ל / כ א ל / כ-א-ל (Israeli abbreviation for Cal credit).
  /כ[\s.\-־]?א[\s.\-־]?ל/i,
  /מקסימום/i,
  // Max (formerly Leumi Card) bills as "מקס איט פיננסים"; word boundaries don't work on Hebrew, so a bare "מקס" must stand alone.
  /מקס[\s־-]*איט/i,
  /(^|\s)מקס(\s|$)/,
  /לאומי[\s־-]*קארד/i,
  /אמקס/i,
  /מאסטרקארד/i,
  /אמריקן\s*אקספרס/i,
  /דיינרס/i,
  /תשלום\s*אשראי/i,
  /כרטיס\s*אשראי/i,
  /חיוב\s*כרטיס/i,
  /חיוב\s*לכרטיס/i,
  /\bISRACARD\b/i,
  /\bVISA\b/i,
  /\bMASTERCARD\b/i,
  /\bCAL\b/i,
  /\bMAX\b/i,
  /\bDINERS\b/i,
  /\bAMEX\b/i,
  /\bAMERICAN\s+EXPRESS\b/i,
];

export const LOAN_DEPOSIT = /הלוואה|הלוואת|\bloan\b/i;

export function isBankProvider(provider: string): provider is BankProvider {
  return BANK_PROVIDERS_SET.has(provider as BankProvider);
}

function matchesTransferPattern(description: string): boolean {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return CREDIT_CARD_PAYMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface KindOptions {
  /**
   * A connected card scraper whose charges explain this bill. Without one the debit is real
   * spending: marking it a transfer hid every card month from all totals.
   */
  cardExplainsBill?: boolean;
}

export function detectKind(
  description: string,
  provider: string,
  chargedAmount: number,
  options: KindOptions = {}
): TransactionKind {
  if (isBankProvider(provider) && matchesTransferPattern(description)) {
    return options.cardExplainsBill ? "transfer" : "expense";
  }
  // A loan landing in the account is borrowed money, not earnings: counting it as income inflates savings.
  if (isBankProvider(provider) && chargedAmount > 0 && LOAN_DEPOSIT.test(description)) {
    return "transfer";
  }
  if (isBankProvider(provider) && chargedAmount > 0) {
    return "income";
  }
  return "expense";
}
