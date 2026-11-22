import "server-only";

import { BANK_PROVIDERS } from "@/lib/types";

/** Card issuers, plus imported statement rows (their account is not tied to a provider yet). */
const CARD_PROVIDERS: ReadonlySet<string> = new Set(
  BANK_PROVIDERS.filter((p) => p.kind === "card").map((p) => p.id)
);

export function isCardProvider(provider: string): boolean {
  return provider === "file" || CARD_PROVIDERS.has(provider);
}
