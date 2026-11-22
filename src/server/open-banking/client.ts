import "server-only";
import { israelToday } from "@/server/lib/date-utils";

import { redact } from "@/server/lib/redact";
import type {
  ScrapedAccount,
  ScrapedTransaction,
  ScrapeResult,
} from "@/server/scrapers/types";

/**
 * Israeli open banking is the Bank of Israel's XS2A standard: a NextGenPSD2
 * (Berlin Group) account information API. A bank, or a licensed aggregator acting
 * for it, answers GET /v1/accounts and GET /v1/accounts/{id}/transactions with a
 * bearer token. We speak that shape directly, so any compliant endpoint works —
 * the fields below are the ones the standard guarantees.
 */
export interface OpenBankingCredentials {
  baseUrl?: string;
  token?: string;
  consentId?: string;
}

interface BgAmount {
  amount?: string;
  currency?: string;
}

interface BgBalance {
  balanceAmount?: BgAmount;
  balanceType?: string;
}

interface BgAccount {
  resourceId?: string;
  id?: string;
  iban?: string;
  bbAN?: string;
  name?: string;
  currency?: string;
  balances?: BgBalance[];
}

interface BgTransaction {
  transactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: BgAmount;
  creditDebitIndicator?: "CRDT" | "DBIT" | string;
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  bankTransactionCode?: string;
}

interface BgTransactionsResponse {
  transactions?: {
    booked?: BgTransaction[];
    pending?: BgTransaction[];
  };
}

function baseUrlOf(credentials: OpenBankingCredentials): string {
  const raw = credentials.baseUrl?.trim();
  if (!raw) throw new Error("Open banking API base URL is missing.");
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error("Open banking API base URL must start with http:// or https://.");
  }
  return raw.replace(/\/+$/, "");
}

function tokenOf(credentials: OpenBankingCredentials): string {
  const token = credentials.token?.trim();
  if (!token) throw new Error("Open banking API access token is missing.");
  return token;
}

function messageFor(status: number, body: string): string {
  const detail = redact(body.slice(0, 300)).trim();
  if (status === 401 || status === 403) {
    return `Open banking rejected the access token (HTTP ${status}).${detail ? ` ${detail}` : ""}`;
  }
  if (status === 404) {
    return `Open banking endpoint not found (HTTP 404) — check the base URL.${detail ? ` ${detail}` : ""}`;
  }
  if (status === 429) {
    return "Open banking rate limit reached (HTTP 429). Try again in a few minutes.";
  }
  return `Open banking request failed (HTTP ${status}).${detail ? ` ${detail}` : ""}`;
}

async function getJson<T>(
  credentials: OpenBankingCredentials,
  path: string
): Promise<T> {
  const url = `${baseUrlOf(credentials)}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${tokenOf(credentials)}`,
    Accept: "application/json",
    "X-Request-ID": crypto.randomUUID(),
  };
  const consentId = credentials.consentId?.trim();
  if (consentId) headers["Consent-ID"] = consentId;

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Open banking endpoint is unreachable: ${redact(msg)}`);
  }

  const text = await response.text();
  if (!response.ok) throw new Error(messageFor(response.status, text));
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Open banking returned a response that is not JSON.");
  }
}

/** The standard wraps the list in `accounts`; some gateways use `data`. */
function accountsOf(payload: unknown): BgAccount[] {
  const record = payload as { accounts?: BgAccount[]; data?: BgAccount[] };
  return record.accounts ?? record.data ?? [];
}

function txnsOf(
  payload: BgTransactionsResponse
): { txn: BgTransaction; pending: boolean }[] {
  const booked = payload.transactions?.booked ?? [];
  const pending = payload.transactions?.pending ?? [];
  return [
    ...booked.map((txn) => ({ txn, pending: false })),
    ...pending.map((txn) => ({ txn, pending: true })),
  ];
}

function balanceOf(account: BgAccount): number | undefined {
  const balances = account.balances ?? [];
  // Prefer the closing/interim booked balance, then anything the bank sent.
  const preferred =
    balances.find((b) => /CLBD|ITBD|OPBD/i.test(b.balanceType ?? "")) ?? balances[0];
  const amount = Number(preferred?.balanceAmount?.amount);
  return Number.isFinite(amount) ? amount : undefined;
}

function isoDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function descriptionOf(txn: BgTransaction): string {
  const parts = [
    txn.remittanceInformationUnstructured,
    txn.remittanceInformationUnstructuredArray?.join(" "),
    txn.creditorName,
    txn.debtorName,
    txn.additionalInformation,
  ].filter((part): part is string => Boolean(part && part.trim()));
  const unique = [...new Set(parts.map((p) => p.trim()))];
  return unique.join(" · ") || "Open banking transaction";
}

function toScrapedTransaction(
  txn: BgTransaction,
  pending: boolean,
  today: string
): ScrapedTransaction {
  const raw = Number(txn.transactionAmount?.amount ?? 0);
  // The standard is signed: a debit (expense) arrives negative, which is also
  // how Penny stores bank charges. Only honour the indicator as a fallback.
  const signed =
    Number.isFinite(raw) && raw !== 0
      ? raw
      : txn.creditDebitIndicator === "DBIT"
        ? -Math.abs(raw)
        : raw;
  const currency = txn.transactionAmount?.currency?.trim() || "ILS";
  const date = isoDate(txn.bookingDate ?? txn.valueDate, today);
  return {
    type: "normal",
    identifier: txn.transactionId,
    date,
    processedDate: date,
    originalAmount: signed,
    originalCurrency: currency,
    chargedAmount: signed,
    chargedCurrency: currency,
    description: descriptionOf(txn),
    memo: txn.bankTransactionCode,
    status: pending ? "pending" : "completed",
  };
}

/**
 * Reads every account the token can see, then the transactions since `startDate`.
 * Shapes the answer as a scrape result, so the sync pipeline stays identical.
 */
export async function connectOpenBanking(
  credentials: Record<string, string>,
  startDate: Date
): Promise<ScrapeResult> {
  const creds: OpenBankingCredentials = {
    baseUrl: credentials.baseUrl,
    token: credentials.token,
    consentId: credentials.consentId,
  };

  try {
    const accountsPayload = await getJson<unknown>(
      creds,
      "/v1/accounts?withBalance=true"
    );
    const accounts = accountsOf(accountsPayload);
    if (accounts.length === 0) {
      return {
        success: false,
        accounts: [],
        errorMessage:
          "Open banking returned no accounts. Approve the consent for the accounts you want to share.",
      };
    }

    const today = israelToday();
    const dateFrom = startDate.toISOString().slice(0, 10);
    const scraped: ScrapedAccount[] = [];

    for (const account of accounts) {
      const accountId = account.resourceId ?? account.id ?? account.iban ?? account.bbAN;
      if (!accountId) continue;
      const payload = await getJson<BgTransactionsResponse>(
        creds,
        `/v1/accounts/${encodeURIComponent(accountId)}/transactions?dateFrom=${dateFrom}&dateTo=${today}&bookingStatus=both`
      );
      const transactions = txnsOf(payload).map(({ txn, pending }) =>
        toScrapedTransaction(txn, pending, today)
      );
      scraped.push({
        accountNumber: account.iban ?? account.bbAN ?? accountId,
        balance: balanceOf(account),
        transactions,
      });
    }

    const total = scraped.reduce((sum, a) => sum + a.transactions.length, 0);
    console.log(
      `[open-banking] success: ${scraped.length} account(s), ${total} transaction(s)`
    );
    return { success: true, accounts: scraped };
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err));
    console.error("[open-banking] failed:", message);
    return { success: false, accounts: [], errorMessage: message };
  }
}
