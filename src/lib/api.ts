import type { Series } from "@/server/insights/recurring";
import type { BillForecast } from "@/server/insights/forecast";
import type { Anomaly } from "@/server/insights/anomalies";
import type { Rule } from "@/server/rules/engine";
import type {
  SetupStatus,
  AppSettings,
  TransactionWithCategory,
  DashboardSummary,
  Category,

  Budget,
  BudgetMode,
  Integration,
  Workspace,
  Profile,
  HomePayload,
  ActivitySnapshot,
  NeedType,
  CostType,
  OverviewPayload,
  AssetsPayload,
  AssetInput,
  MarketsPayload,
  FiPayload,
  PlanPayload,
  InsurancePayload,
} from "./types";
import { getActiveProfileIdSync, getActiveWorkspaceIdSync } from "./workspace-store";

const BASE = "";

function withWorkspaceHeader(init?: RequestInit): RequestInit {
  const wsId = getActiveWorkspaceIdSync();
  const headers = new Headers(init?.headers);
  if (wsId != null && !headers.has("x-workspace-id")) {
    headers.set("x-workspace-id", String(wsId));
  }
  const profileId = getActiveProfileIdSync();
  if (profileId != null && !headers.has("x-profile-id")) headers.set("x-profile-id", String(profileId));
  return { ...init, headers };
}

/** Error messages in the UI's language. Server details are mostly English, so in Hebrew we explain by status instead. */
const ERRORS = {
  he: {
    network: "אין חיבור לשרת של Penny. ודאו שהאפליקציה פועלת ונסו שוב.",
    400: "חלק מהפרטים לא תקינים. בדקו אותם ונסו שוב.",
    401: "צריך להתחבר מחדש. רעננו את הדף.",
    403: "אין הרשאה לפעולה הזאת.",
    404: "לא מצאנו את מה שחיפשתם. ייתכן שזה נמחק.",
    409: "הנתונים השתנו בינתיים. רעננו את הדף ונסו שוב.",
    syncBusy: "סנכרון כבר רץ עכשיו. נסו שוב בעוד רגע.",
    locked: "האפליקציה נעולה. הזינו את הקוד כדי להמשיך.",
    signInRequired: "צריך לבחור משתמש מחדש. רעננו את הדף.",
    streamLost: "החיבור נקטע לפני שהפעולה הסתיימה. בדקו ש־Penny פועלת ונסו שוב.",

    ownerRequired: "רק הבעלים של Penny יכול לבצע את הפעולה הזאת.",
    workspaceDenied: "אין הרשאה לסביבה הזאת.",
    duplicateName: "כבר קיים פריט בשם הזה. בחרו שם אחר.",
    lastProfile: "אי אפשר למחוק את הפרופיל האחרון. הוסיפו פרופיל חדש קודם.",
    lastWorkspace: "אי אפשר למחוק את הסביבה האחרונה.",
    hasChildren: "לקטגוריה הזאת יש תתי־קטגוריות. מחקו אותן קודם.",
    targetMissing: "הקטגוריה שאליה משייכים כבר לא קיימת.",
    notLeafTarget: "אפשר לבחור רק קטגוריה ראשית בתור הורה.",
    kindMismatch: "אי אפשר לשים קטגוריית הוצאה תחת קטגוריית הכנסה, או להיפך.",
    selfParent: "קטגוריה לא יכולה להיות ההורה של עצמה.",
    childHasChildren: "לקטגוריה הזאת כבר יש תתי־קטגוריות, ולכן אי אפשר להעביר אותה.",

    429: "יותר מדי ניסיונות. חכו רגע ונסו שוב.",
    server: "משהו השתבש אצלנו. נסו שוב בעוד רגע.",
  },
  en: {
    network: "Can't reach the Penny server. Make sure the app is running and try again.",
    400: "Some details aren't valid. Check them and try again.",
    401: "Please sign in again. Refresh the page.",
    403: "You don't have permission for this.",
    404: "We couldn't find that. It may have been deleted.",
    409: "The data changed meanwhile. Refresh the page and try again.",
    syncBusy: "A sync is already running. Try again in a moment.",
    locked: "The app is locked. Enter your code to continue.",
    signInRequired: "Please choose a user again. Refresh the page.",
    streamLost: "The connection dropped before it finished. Check that Penny is running and try again.",

    ownerRequired: "Only the owner of Penny can do this.",
    workspaceDenied: "You don't have access to this workspace.",
    duplicateName: "Something with that name already exists. Pick another name.",
    lastProfile: "The last profile can't be deleted. Add another profile first.",
    lastWorkspace: "The last workspace can't be deleted.",
    hasChildren: "This category has subcategories. Delete them first.",
    targetMissing: "The category you're moving it under no longer exists.",
    notLeafTarget: "Only a top-level category can be the parent.",
    kindMismatch: "An expense category can't sit under an income category, or the other way round.",
    selfParent: "A category can't be its own parent.",
    childHasChildren: "This category already has subcategories, so it can't be moved.",

    429: "Too many attempts. Wait a moment and try again.",
    server: "Something went wrong on our side. Try again in a moment.",
  },
} as const;

/** Machine codes the API and the proxy send; they are never shown as they are. */
/** A failed request: `status` lets callers tell a user error from a broken server. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number | "network") {
    super(message);
    this.name = "ApiError";
  }
}

/** A server `code` the app words itself; anything else falls back to the status text. */
const CODE_MESSAGES: Record<string, keyof typeof ERRORS.he> = {
  locked: "locked",
  "sign-in-required": "signInRequired",
  "sync-running": "syncBusy",
  "owner-required": "ownerRequired",
  "workspace-access-denied": "workspaceDenied",
  "duplicate-name": "duplicateName",
  "last-profile": "lastProfile",
  "last-workspace": "lastWorkspace",
  "has-children": "hasChildren",
  "not-found": 404,
  "target-not-found": "targetMissing",
  "not-leaf-target": "notLeafTarget",
  "kind-mismatch": "kindMismatch",
  "self-parent": "selfParent",
  "child-has-children": "childHasChildren",
};

const uiLang = (): "he" | "en" => (typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "he");

/** Picks a message the user can read: the server's own text when it is in the UI language, else one by status. */
export function friendlyError(status: number | "network", body = "", lang = uiLang()): string {
  let detail = body.trim();
  let serverCode = "";
  try {
    const j = JSON.parse(detail) as { error?: unknown; message?: unknown; code?: unknown };
    detail = String(j.error ?? j.message ?? "");
    serverCode = typeof j.code === "string" ? j.code : "";
  } catch {}
  const m = ERRORS[lang];
  // A machine code is an id, not copy: never show it as it is.
  const key = CODE_MESSAGES[(serverCode || detail).toLowerCase()];
  if (key) return m[key];
  const hebrew = /[֐-׿]/.test(detail);
  // A bare identifier ("bad_request", "not_restartable") is a code, not copy: it falls through
  // to the status text, so every such code gets a readable message without an entry here.
  const isCode = /^[a-z0-9_-]+$/.test(detail);
  const fits = detail && detail.length < 200 && !isCode && !/^\s*</.test(detail) && (lang === "he" ? hebrew : !hebrew);
  if (fits) return detail;
  if (status === "network") return m.network;
  // 409 covers duplicates, in-use records and the sync lock; only the lock has its own wording.
  if (status === 409) return /sync/i.test(detail) && /running/i.test(detail) ? m.syncBusy : m[409];
  return status in m ? m[status as keyof typeof m] : status >= 500 ? m.server : m[400];
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, withWorkspaceHeader(init)).catch(() => {
    throw new ApiError(friendlyError("network"), "network");
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(friendlyError(res.status, text), res.status);
  }
  const raw = await res.text().catch(() => "");
  // A DELETE answers 204 with no body: that is success, not a parse error.
  if (!raw.trim()) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(friendlyError(res.status, raw), res.status);
  }
}

export function listProfiles() {
  return fetchJSON<Profile[]>("/api/profiles");
}

export function saveProfile(id: number | null, name: string, avatar: { avatarEmoji?: string | null; avatarColor?: string | null; avatarPet?: import("./profile-avatar").ProfilePip | null; avatarPhoto?: string | null } = {}) {
  return fetchJSON<Profile>(id == null ? "/api/profiles" : `/api/profiles/${id}`, {
    method: id == null ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...avatar }),
  });
}

export function deleteProfile(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/profiles/${id}`, { method: "DELETE" });
}

export function listWorkspaces() {
  return fetchJSON<Workspace[]>("/api/workspaces");
}

export function createWorkspace(
  name: string,
  avatar: { avatarEmoji?: string | null; avatarColor?: string | null } = {}
) {
  return fetchJSON<Workspace>("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...avatar }),
  });
}

export function renameWorkspace(
  id: number,
  name: string,
  avatar: { avatarEmoji?: string | null; avatarColor?: string | null } = {}
) {
  return fetchJSON<Workspace>(`/api/workspaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...avatar }),
  });
}

export function deleteWorkspace(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/workspaces/${id}`, {
    method: "DELETE",
  });
}

export function getSetupStatus() {
  return fetchJSON<SetupStatus>("/api/setup/status");
}

/** Where first-run onboarding stands (resume point), or "complete". */
export function saveOnboardingStep(step: import("./onboarding").OnboardingStep | "complete") {
  return fetchJSON<{ success: boolean }>("/api/setup/onboarding", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  });
}

export function saveBankCredentials(
  provider: string,
  credentials: Record<string, string>,
  options?: {
    label?: string;
    credentialId?: number;
    requiresManualTwoFactor?: boolean;
  }
) {
  return fetchJSON<{ success: boolean; credentialId: number }>("/api/setup/bank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      credentials,
      ...(options?.label !== undefined ? { label: options.label } : {}),
      ...(options?.credentialId !== undefined
        ? { credentialId: options.credentialId }
        : {}),
      ...(options?.requiresManualTwoFactor !== undefined
        ? { requiresManualTwoFactor: options.requiresManualTwoFactor }
        : {}),
    }),
  });
}

export function updateIntegrationSettings(
  credentialId: number,
  updates: { requiresManualTwoFactor?: boolean; resetTwoFactorToken?: boolean }
) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${credentialId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function submitSyncOtp(syncRunId: number, code: string) {
  return fetchJSON<{ success: boolean }>("/api/sync/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncRunId, code }),
  });
}

export function testBankConnection(
  provider: string,
  options?: { credentialId?: number; credentials?: Record<string, string> }
) {
  return fetchJSON<{
    success: boolean;
    message: string;
    accountsFound?: number;
  }>("/api/setup/bank/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      ...(options?.credentialId !== undefined
        ? { credentialId: options.credentialId }
        : {}),
      ...(options?.credentials !== undefined
        ? { credentials: options.credentials }
        : {}),
    }),
  });
}

export function saveAIConfig(config: {
  provider: AppSettings["aiProvider"];
  apiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}) {
  return fetchJSON<{ success: boolean }>("/api/setup/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export function getAIKeyStatus() {
  return fetchJSON<{ hasClaudeKey: boolean }>("/api/setup/ai");
}

export function getSettings() {
  return fetchJSON<AppSettings>("/api/settings");
}

export function updateSettings(settings: Partial<AppSettings>) {
  return fetchJSON<AppSettings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export type TransactionKindFilter = "expense" | "income" | "all";
export type TransactionKind = "expense" | "income" | "transfer";
export type CategoryKindFilter = "expense" | "income";

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
}

export function getTransactionsSummary(params: {
  from: string;
  to: string;
  credentialIds?: number[];
}) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  if (params.credentialIds?.length) {
    for (const id of params.credentialIds) {
      sp.append("credentialIds", String(id));
    }
  }
  return fetchJSON<TransactionsSummary>(`/api/transactions/summary?${sp}`);
}

export function getTransactions(params: {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  credentialIds?: number[];
  /** Household member id or "shared": only that member's rows. */
  owner?: string;
  /** "1": only rows hidden from totals. */
  hidden?: string;
  /** One bank account or card, by its account number. */
  account?: string;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (
      (key === "categoryIds" || key === "credentialIds") &&
      Array.isArray(value)
    ) {
      for (const id of value) searchParams.append(key, String(id));
      return;
    }
    searchParams.set(key, String(value));
  });
  return fetchJSON<{ transactions: TransactionWithCategory[]; total: number }>(
    `/api/transactions?${searchParams}`
  );
}

export function setTransactionKind(id: number, kind: TransactionKind) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
}

export function approveTransactionCategory(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approve: true }),
  });
}

export function setTransactionExcluded(
  id: number,
  excluded: boolean,
  alwaysForMerchant = false,
) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}/exclude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excluded, alwaysForMerchant }),
  });
}

export interface PaybackTxn {
  id: number;
  date: string;
  description: string;
  /** Signed as charged: an expense is negative, a payback credit positive. */
  amount: number;
}

export interface PaybackLinkView {
  credit: PaybackTxn;
  expense: PaybackTxn;
}

export interface PaybackState {
  links: PaybackLinkView[];
  candidates: PaybackTxn[];
  /** How much of this expense earlier credits already covered. */
  coveredAbs: number;
}

/** The links touching a transaction, plus the rows near it that could still be paired with it. */
export function getPayback(id: number) {
  return fetchJSON<PaybackState>(`/api/transactions/${id}/payback`);
}

/** Pairs a credit with the expense it repays; either id may be the credit. */
export function linkPayback(id: number, targetId: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}/payback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
}

export function unlinkPayback(creditId: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${creditId}/payback`, {
    method: "DELETE",
  });
}

export interface ExcludedMerchantRule {
  id: number;
  provider: string;
  merchantKey: string;
  createdAt: string;
}

export function listExcludedMerchants() {
  return fetchJSON<{ rules: ExcludedMerchantRule[] }>(
    `/api/excluded-merchants`,
  );
}

export function deleteExcludedMerchantRule(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/excluded-merchants/${id}`, {
    method: "DELETE",
  });
}

export function getSummary(params: {
  from: string;
  to: string;
  months?: number;
  /** Household member id or "shared": that member's spend only. */
  owner?: string;
}) {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.months) searchParams.set("months", String(params.months));
  if (params.owner) searchParams.set("owner", params.owner);
  return fetchJSON<DashboardSummary>(`/api/summary?${searchParams}`);
}

export function getOverview(period: string, offset: number) {
  return fetchJSON<OverviewPayload>(`/api/overview?period=${period}&offset=${offset}`);
}

export function getBalanceForecast() {
  return fetchJSON<{
    forecast: import("./balance-forecast").BalanceForecast | null;
    accounts: import("./balance-forecast").BalanceForecastPayload | null;
  }>(`/api/balance-forecast`);
}

/** Pins a card's statement to the bank account that pays it; null clears the choice. */
export function setCardBankLink(card: string, bank: string | null) {
  return fetchJSON<{ success: boolean }>(`/api/balance-forecast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card, bank }),
  });
}

export function getCashAhead() {
  return fetchJSON<import("./cash-ahead").CashAhead>(`/api/cash-ahead`);
}

export function getSuggestions() {
  return fetchJSON<{ suggestions: import("./suggestions").Suggestion[]; dismissed: string[]; stageHints: import("./stage-detect").StageHint[]; donations?: { year: number; total: number }[] }>(`/api/suggestions`);
}

export function dismissSuggestion(key: string) {
  return fetchJSON<{ success: boolean }>(`/api/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

export function getPlan() {
  return fetchJSON<PlanPayload>(`/api/plan`);
}

export function savePlan(plan: PlanPayload["plan"]) {
  return fetchJSON<PlanPayload["plan"]>(`/api/plan`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

export function savePlanItem(kind: "goal" | "policy" | "netWorth", item: Record<string, unknown>) {
  return fetchJSON<{ success: boolean }>(`/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, item }),
  });
}

export function deletePlanItem(kind: "goal" | "policy" | "netWorth", key: number | string) {
  const param = kind === "netWorth" ? `date=${encodeURIComponent(String(key))}` : `id=${key}`;
  return fetchJSON<{ success: boolean }>(`/api/plan?kind=${kind}&${param}`, { method: "DELETE" });
}

export function getFi() {
  return fetchJSON<FiPayload>(`/api/fi`);
}

export function getMarkets() {
  return fetchJSON<MarketsPayload>(`/api/markets`);
}

/** Symbols the household added to Markets. */
export function getMarketWatchlist() {
  return fetchJSON<{ symbols: string[] }>(`/api/markets/watchlist`);
}

export function addMarketSymbol(symbol: string) {
  return fetchJSON<{ symbol: string }>(`/api/markets/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
}

export function removeMarketSymbol(symbol: string) {
  return fetchJSON<void>(`/api/markets/watchlist`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
}

export function getInsurance() {
  return fetchJSON<InsurancePayload>(`/api/insurance`);
}

/** Creates a policy, or updates it when item.id is set. */
export function saveInsurancePolicy(item: Record<string, unknown>) {
  return fetchJSON<{ success: boolean; id: number }>(`/api/insurance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item }),
  });
}

export function deleteInsurancePolicy(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/insurance/${id}`, { method: "DELETE" });
}

export function uploadInsuranceDocument(policyId: number, file: File, kind: string) {
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  return fetchJSON<import("./types").InsuranceDocument>(`/api/insurance/${policyId}/documents`, { method: "POST", body: form });
}

export function setInsuranceDocumentKind(docId: number, kind: string) {
  return fetchJSON<{ success: boolean }>(`/api/insurance/documents/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
}

export function deleteInsuranceDocument(docId: number) {
  return fetchJSON<{ success: boolean }>(`/api/insurance/documents/${docId}`, { method: "DELETE" });
}

/** The stored file as a blob, so a non-default workspace opens the right one. */
export async function fetchInsuranceDocument(docId: number) {
  const res = await fetch(`/api/insurance/documents/${docId}`, withWorkspaceHeader()).catch(() => {
    throw new ApiError(friendlyError("network"), "network");
  });
  if (!res.ok) throw new ApiError(friendlyError(res.status, await res.text().catch(() => "")), res.status);
  return res.blob();
}

export interface Receipt { id: number; transactionId: number; originalName: string; mime: string; size: number; uploadedAt: string }

export function getReceipts(transactionId: number) {
  return fetchJSON<{ receipts: Receipt[] }>(`/api/transactions/${transactionId}/receipts`);
}

export function uploadReceipt(transactionId: number, file: File) {
  const form = new FormData();
  form.set("file", file);
  return fetchJSON<Receipt>(`/api/transactions/${transactionId}/receipts`, { method: "POST", body: form });
}

export function deleteReceipt(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/receipts/${id}`, { method: "DELETE" });
}

/** The stored receipt as a blob, so a non-default workspace opens the right one. */
export async function fetchReceipt(id: number) {
  const res = await fetch(`/api/receipts/${id}`, withWorkspaceHeader()).catch(() => {
    throw new ApiError(friendlyError("network"), "network");
  });
  if (!res.ok) throw new ApiError(friendlyError(res.status, await res.text().catch(() => "")), res.status);
  return res.blob();
}

/** Rows read from pasted text by the user's AI provider, for the sheet import preview. Nothing is saved. */
export function extractTextRows(text: string) {
  return fetchJSON<{ rows: import("./text-import").ExtractedRow[] }>(`/api/import/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export function getTrades(assetId: number) {
  return fetchJSON<{ trades: import("./holding-trades").HoldingTrade[]; summary: { quantity: number; costBasis: number; realized: number } }>(`/api/assets/${assetId}/trades`);
}

export function addTrade(assetId: number, trade: Omit<import("./holding-trades").HoldingTrade, "id">) {
  return fetchJSON<import("./holding-trades").HoldingTrade>(`/api/assets/${assetId}/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trade),
  });
}

export function deleteTrade(tradeId: number) {
  return fetchJSON<{ success: boolean }>(`/api/assets/trades/${tradeId}`, { method: "DELETE" });
}

export function getPlanned() {
  return fetchJSON<import("./planned").PlannedPayload>(`/api/planned`);
}

/** Creates a planned expense, or updates it when item.id is set. */
export function savePlannedItem(item: Record<string, unknown>) {
  return fetchJSON<{ success: boolean; id: number }>(`/api/planned`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item }),
  });
}

export function deletePlannedItem(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/planned/${id}`, { method: "DELETE" });
}

export function setPlannedItemStatus(id: number, status: "planned" | "matched" | "cancelled") {
  return fetchJSON<{ success: boolean }>(`/api/planned/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function plannedAction(action: "match" | "link" | "reject" | "unlink", ids: { itemId?: number; txnId?: number } = {}) {
  return fetchJSON<{ success?: boolean; matched?: number; ambiguous?: number }>(`/api/planned/act`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...ids }),
  });
}

export function getPivot(months: number) {
  return fetchJSON<{ months: string[]; rows: import("./pivot").PivotRow[] }>(`/api/pivot?months=${months}`);
}

export function getAssets() {
  return fetchJSON<AssetsPayload>(`/api/assets`);
}

export function createAssets(assets: AssetInput[]) {
  return fetchJSON<{ created: number }>(`/api/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assets }),
  });
}

export function updateAsset(id: number, asset: AssetInput) {
  return fetchJSON<{ success: boolean }>(`/api/assets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(asset),
  });
}

export function deleteAsset(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/assets/${id}`, { method: "DELETE" });
}

/** `owner` (a household member id or "shared") scopes the spend and cash figures to that member. */
export function getHome(owner?: string, month?: string) {
  const sp = new URLSearchParams();
  if (owner) sp.set("owner", owner);
  if (month) sp.set("month", month);
  return fetchJSON<HomePayload>(`/api/home${sp.size ? `?${sp}` : ""}`);
}

export function getNotifications() {
  return fetchJSON<{ items: import("./notifications").AppNotification[] }>(`/api/notifications`);
}

export function getActivity() {
  return fetchJSON<ActivitySnapshot>(`/api/activity`);
}

export function getCategories(kind?: CategoryKindFilter) {
  const qs = kind ? `?kind=${kind}` : "";
  return fetchJSON<Category[]>(`/api/categories${qs}`);
}

export function updateTransactionCategory(id: number, categoryId: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });
}

export interface CategoryChildBreakdown {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  spent: number;
  budget: number;
  budgetMode: BudgetMode;
  isAutoBudget: boolean;
  percentSpent: number;
}

export interface CategoryDetail {
  category: {
    id: number;
    parentId: number | null;
    name: string;
    color: string;
    icon: string | null;
    kind: "expense" | "income";
    budgetMode: BudgetMode;
    isParent: boolean;
  };
  spent: number;
  budget: number;
  isAutoBudget: boolean;
  budgetSource: "own" | "rollup" | "leaf";
  vsTypical: { typical: number; percentDiff: number } | null;
  remaining: number;
  percentSpent: number;
  transactionCount: number;
  avgPerTransaction: number;
  vsLastMonth: number | null;
  prevSpent: number;
  prevPeriodLabel: string;
  dailySpend: Array<{ date: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  transactions: TransactionWithCategory[];
  needsReviewTransactions: TransactionWithCategory[];
  needsReviewCount: number;
  period: { from: string; to: string };
  children: CategoryChildBreakdown[] | null;
}

export function getCategoryDetail(
  id: number,
  params: { from: string; to: string }
) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  return fetchJSON<CategoryDetail>(`/api/categories/${id}/detail?${sp}`);
}

export function getBudgets() {
  return fetchJSON<Budget[]>("/api/budgets");
}

export function getFlowMatches() {
  return fetchJSON<import("./flow-matches").FlowMatchView[]>("/api/flow-matches");
}

/** Undo one automatic pairing; the rows return to their previous classification. */
export function cancelFlowMatch(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/flow-matches/${id}`, { method: "DELETE" });
}

export function getBudgetPeriod(month?: string) {
  return fetchJSON<import("./finance-period").BudgetPeriodPayload>(`/api/budgets/period${month ? `?month=${month}` : ""}`);
}

export function setBudgetRollover(categoryId: number, rollover: import("./finance-period").RolloverRule) {
  return fetchJSON<{ success: boolean }>("/api/budgets/period", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, rollover }),
  });
}

export function updateBudget(categoryId: number, amount: number | null) {
  return fetchJSON<{ success: boolean }>("/api/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, amount }),
  });
}

export function updateCategoryBudgetMode(
  categoryId: number,
  mode: BudgetMode
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetMode: mode }),
  });
}

export function updateCategoryDescription(
  categoryId: number,
  description: string | null
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

export function updateCategoryLook(categoryId: number, fields: { name?: string; color?: string }) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

export function setCategoryParent(
  categoryId: number,
  parentId: number | null
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
}

export function updateCategorySpendingType(
  categoryId: number,
  fields: { needType?: NeedType; costType?: CostType }
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

export function createCategory(input: {
  name: string;
  kind: CategoryKindFilter;
  isParent?: boolean;
  icon?: string;
  color?: string;
  parentId?: number | null;
  description?: string | null;
}) {
  return fetchJSON<Category>("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function setBudgetModesBulk(budgetedIds: number[]) {
  return fetchJSON<{ success: boolean }>("/api/categories/budget-modes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetedIds }),
  });
}

export function listIntegrations() {
  return fetchJSON<Integration[]>("/api/integrations");
}

export interface DeleteTransactionsResult {
  success: boolean;
  deleted: { txCount: number; syncCount: number; memoryCount: number };
}

export function deleteAllTransactions() {
  return fetchJSON<DeleteTransactionsResult>("/api/data/transactions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "delete-all-transactions" }), // server refuses without it
  });
}

export function deleteIntegration(credentialId: number) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${credentialId}`, {
    method: "DELETE",
  });
}

export function getIntegrationCredentials(credentialId: number) {
  return fetchJSON<{
    credentials: Record<string, string> | null;
    label: string | null;
    provider: string | null;
    requiresManualTwoFactor: boolean;
    hasTwoFactorToken: boolean;
  }>(`/api/integrations/${credentialId}`);
}

export function deleteCategory(categoryId: number) {
  return fetchJSON<{
    success: boolean;
    deletedCategoryId: number;
    unassignedTransactionCount: number;
  }>(`/api/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export interface CategorizeAssignment {
  transactionId: number;
  description: string;
  categoryName: string;
  isNew: boolean;
  kind: CategoryKindFilter;
}

export interface CategorizeProposal {
  name: string;
  kind: CategoryKindFilter;
  transactionIds: number[];
  samples: string[];
}

export interface CategorizePreview {
  uncategorizedCount: number;
  assignments: CategorizeAssignment[];
  proposedCategories: CategorizeProposal[];
  existingCategoryUsage: Record<string, number>;
  errors?: string[];
}

export function previewCategorize() {
  return fetchJSON<CategorizePreview>("/api/categorize/preview", {
    method: "POST",
  });
}

export function applyCategorize(payload: {
  assignments: Array<{
    transactionId: number;
    categoryName: string;
    isNew: boolean;
    kind?: CategoryKindFilter;
  }>;
  approvedNewCategoryNames: string[];
  rejectionFallbacks?: Record<string, string>;
}) {
  return fetchJSON<{
    appliedCount: number;
    createdCategoriesCount: number;
    skippedCount: number;
  }>("/api/categorize/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type SyncEventType =
  | "plan"
  | "provider-start"
  | "provider-done"
  | "provider-2fa-needed"
  | "provider-2fa-submitted"
  | "provider-2fa-manual"
  | "stage"
  | "complete"
  | "error";

export interface SyncProgressEvent {
  type: SyncEventType;
  data: Record<string, unknown>;
}

export function startSync(
  credentialId: number | undefined,
  onEvent: (event: SyncProgressEvent) => void
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        "/api/sync",
        withWorkspaceHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            credentialId != null ? { credentialId } : {}
          ),
          signal: controller.signal,
        })
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onEvent({ type: "error", data: { message: friendlyError(res.status, text) } });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onEvent({ type: "error", data: { message: ERRORS[uiLang()].streamLost } });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      // A stream that stops without "complete" means the sync died mid-way; otherwise the UI spins forever.
      let settled = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "complete" || currentEvent === "error") settled = true;
              onEvent({ type: currentEvent as SyncProgressEvent["type"], data });
            } catch {
              // skip malformed JSON
            }
            currentEvent = "";
          }
        }
      }
      if (!settled) onEvent({ type: "error", data: { message: ERRORS[uiLang()].streamLost } });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onEvent({
        type: "error",
        data: { message: ERRORS[uiLang()].streamLost },
      });
    }
  })();

  return { cancel: () => controller.abort() };
}


export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  speed?: number;
  etaSeconds?: number | null;
}

export interface PullEvent {
  type: "progress" | "complete" | "error";
  data: PullProgress & { message?: string };
}

export function listOllamaModels(url?: string) {
  const qs = url ? `?url=${encodeURIComponent(url)}` : "";
  // The page sends no Referer (Referrer-Policy: no-referrer), but the proxy origin-checks this GET; send it same-origin only.
  return fetchJSON<{ models: string[]; error?: string }>(
    `/api/ai/ollama/models${qs}`,
    { referrerPolicy: "same-origin" }
  );
}

export function pullOllamaModel(
  model: string,
  url: string | undefined,
  onEvent: (event: PullEvent) => void
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        "/api/ai/ollama/pull",
        withWorkspaceHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, url }),
          signal: controller.signal,
        })
      );

      if (!res.ok) {
        onEvent({ type: "error", data: { status: "error", message: friendlyError(res.status, await res.text().catch(() => "")) } });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onEvent({ type: "error", data: { status: "error", message: ERRORS[uiLang()].streamLost } });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ type: currentEvent as PullEvent["type"], data });
            } catch {
              // skip
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onEvent({
        type: "error",
        data: { status: "error", message: ERRORS[uiLang()].streamLost },
      });
    }
  })();

  return { cancel: () => controller.abort() };
}

export interface InsightsPayload {
  series: Series[];
  forecast: BillForecast[];
  anomalies: Anomaly[];
  /** Open installment plans: total owed, 12-month runoff and each plan. */
  installments: ReturnType<typeof import("@/server/insights/installments").openInstallments>;
}

export function getInsights() {
  return fetchJSON<InsightsPayload>("/api/insights");
}

export function listRules() {
  return fetchJSON<Rule[]>("/api/rules");
}

export function createRule(rule: Omit<Rule, "id">) {
  return fetchJSON<{ id: number }>("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
}

export async function deleteRule(id: number) {
  const res = await fetch(`${BASE}/api/rules/${id}`, withWorkspaceHeader({ method: "DELETE" })).catch(() => {
    throw new ApiError(friendlyError("network"), "network");
  });
  if (!res.ok) throw new ApiError(friendlyError(res.status, await res.text().catch(() => "")), res.status);
}

export function searchFunds(source: "gemel" | "pension", q: string) {
  return fetchJSON<{ funds: import("./types").Fund[] }>(`/api/funds?source=${source}&q=${encodeURIComponent(q)}`);
}

export function getBudgetSuggestions() {
  return fetchJSON<import("./budget-suggest").BudgetSuggestion[]>("/api/budgets/suggest");
}

export function getReviewInbox() {
  return fetchJSON<{ transactions: TransactionWithCategory[]; total: number }>(
    "/api/transactions?needsReview=1&limit=200&sort=date&order=desc"
  );
}

export function unapproveTransaction(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approve: false }),
  });
}

export function previewRule(rule: Omit<Rule, "id">) {
  return fetchJSON<{ count: number; sample: string[] }>("/api/rules/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule }),
  });
}

export function createRuleWithPast(rule: Omit<Rule, "id">, applyToPast: boolean) {
  return fetchJSON<{ id: number; applied: number }>("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rule, applyToPast }),
  });
}

export function getPeriodic() {
  return fetchJSON<import("./periodic").PeriodicPayload>(`/api/periodic`);
}

export function savePeriodic(item: Record<string, unknown>) {
  return fetchJSON<{ success: boolean }>(`/api/periodic`, {
    method: item.id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item }),
  });
}

export function dismissPeriodicSuggestion(autoKey: string) {
  return fetchJSON<{ success: boolean }>(`/api/periodic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dismiss: autoKey }),
  });
}

export function deletePeriodic(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/periodic?id=${id}`, { method: "DELETE" });
}

export type PensionConnection = { id: number; fundId: string; lastSyncAt: string | null; lastError: string | null; state: "idle" | "running" | "otp" | "done" | "error"; message?: string };
export function listPension() {
  return fetchJSON<{ connections: PensionConnection[] }>(`/api/pension`);
}
export function pensionAction(body: Record<string, unknown>) {
  return fetchJSON<{ id?: number; started?: boolean; success?: boolean }>(`/api/pension`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
export function deletePension(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/pension?id=${id}`, { method: "DELETE" });
}
export type PensionReportRecord = {
  id: number;
  asOf: string;
  member: string;
  source: string;
  fileName: string | null;
  issuedAt: string | null;
  totalSavings: number;
  products: number;
  importedAt: string;
};
export function listPensionReports() {
  return fetchJSON<{ reports: PensionReportRecord[] }>(`/api/pension/report`);
}
export function importPensionReport(report: unknown) {
  return fetchJSON<{ products: number; created: number; updated: number; policies: number; policiesCreated: number; reportId: number }>(
    `/api/pension/report`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) }
  );
}

export function getCashflowHealth() {
  return fetchJSON<{ hasData: boolean; signs: import("./cashflow-health").CashflowSign[]; level: import("./cashflow-health").CashflowLevel; avgIncome: number; avgExpenses: number }>(`/api/cashflow-health`);
}

export function getResilience() {
  return fetchJSON<import("./resilience").Resilience & { ageOfMoney: number | null }>(`/api/resilience`);
}

export function getRecap(query: { month?: string; year?: number }) {
  const q = query.year ? `year=${query.year}` : query.month ? `month=${query.month}` : "";
  return fetchJSON<{ mode: "month"; recap: import("./recap").MonthRecap } | { mode: "year"; recap: import("./recap").YearRecap }>(`/api/recap?${q}`);
}

// ---- Tags, owners, cash wallet ----

export function setTransactionTags(id: number, tags: string[]) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
}

export function renameTag(from: string, to: string) {
  return fetchJSON<{ changed: number }>(`/api/transactions/tags`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
}

export function deleteTag(tag: string) {
  return fetchJSON<{ removed: number }>(`/api/transactions/tags?tag=${encodeURIComponent(tag)}`, { method: "DELETE" });
}

export function getCurrencies() {
  return fetchJSON<{ base: string; currencies: { currency: string; transactions: number; assets: number; rate: number | null; asOf: string | null; change30d: number | null }[] }>(`/api/currencies`);
}

export function getMerchants() {
  return fetchJSON<{ merchants: { merchant: string; count: number; total: number; last: string }[] }>(`/api/transactions/merchants`);
}

export function setTransactionOwner(id: number, owner: string | null) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner }),
  });
}

export function getTagReport(tag?: string) {
  return fetchJSON<{ tags: import("./tags").TagTotal[]; breakdown: { category: string | null; total: number }[] }>(
    `/api/transactions/tags${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`
  );
}

export function getOwners(from: string, to: string) {
  return fetchJSON<{
    accountOwners: import("./tags").AccountOwners;
    accounts: { accountNumber: string; label: string | null; provider: string }[];
    summary: import("./tags").OwnerSummary;
  }>(`/api/transactions/owners?from=${from}&to=${to}`);
}

export function setAccountOwner(accountNumber: string, owner: string | null) {
  return fetchJSON<{ accountOwners: import("./tags").AccountOwners }>(`/api/transactions/owners`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountNumber, owner }),
  });
}

export function getBusinessReport(from: string, to: string) {
  return fetchJSON<import("@/server/db/queries/business").BusinessReport>(`/api/business?from=${from}&to=${to}`);
}

export function getCashWallet() {
  return fetchJSON<{ days: number; withdrawn: number; logged: number; balance: number }>(`/api/transactions/cash`);
}

export function logCashExpense(amount: number, description: string) {
  return fetchJSON<{ id: number }>(`/api/transactions/cash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, description }),
  });
}

export function deleteCashExpense(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/cash?id=${id}`, { method: "DELETE" });
}

export type ImportSource = "bank" | "card";

export function importStatement(
  account: string,
  rows: { date: string; description: string; amount: number }[],
  dryRun = false,
  source: ImportSource = "bank",
) {
  return fetchJSON<{
    ready: number;
    duplicates: number;
    added: number;
    batchId: number | null;
    categorized: number;
    needsReview: number;
  }>(`/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, rows, dryRun, source }),
  });
}

export function undoStatementImport(batchId: number) {
  return fetchJSON<{ removed: number }>(`/api/import?batch=${batchId}`, { method: "DELETE" });
}

export interface SheetRowInput {
  date: string;
  description: string;
  amount: number;
  kind: "expense" | "income";
  account: string;
  category?: string;
  tags?: string[];
  owner?: string | null;
  businessSharePct?: number;
  memo?: string | null;
}

export interface SheetImportResult {
  dryRun: boolean;
  ready: number;
  added: number;
  duplicates: number;
  errors: number;
  categorized: number;
  needsReview: number;
  importId: number | null;
  batchId: number | null;
  rows: { index: number; status: "added" | "duplicate" | "error"; code?: string }[];
}

/** Saves the smart sheet; dryRun only reports duplicates and per-row errors. */
export function importSheet(rows: SheetRowInput[], dryRun = false) {
  return fetchJSON<SheetImportResult>(`/api/import/sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, dryRun }),
  });
}

export function undoSheetImport(importId: number) {
  return fetchJSON<{ removed: number }>(`/api/import/sheet?import=${importId}`, { method: "DELETE" });
}

/** Category suggestions from merchant memory (never written by the server). */
export function suggestSheetCategories(rows: { description: string; kind: "expense" | "income" }[]) {
  return fetchJSON<{ suggestions: { index: number; categoryId: number; name: string; kind: "expense" | "income" }[] }>(
    `/api/import/sheet/suggest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    },
  );
}

export function getLegacyNotes() {
  return fetchJSON<import("./legacy").LegacyNotes>(`/api/legacy`);
}

export function saveLegacyNotes(notes: import("./legacy").LegacyNotes) {
  return fetchJSON<import("./legacy").LegacyNotes>(`/api/legacy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notes),
  });
}

export type FolderImportConfig = import("@/server/lib/folder-import").FolderImportConfig;

export function getFolderImport() {
  return fetchJSON<FolderImportConfig>(`/api/import/folder`);
}

export function updateFolderImport(patch: { enabled?: boolean; dir?: string; account?: string; minutes?: number } | { action: "scan" | "open" }) {
  return fetchJSON<FolderImportConfig>(`/api/import/folder`, {
    method: "action" in patch ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export type LegacyExportConfig = import("@/server/lib/legacy-export").LegacyExportConfig;

export function getLegacyExport() {
  return fetchJSON<LegacyExportConfig>(`/api/legacy/export`);
}

export function updateLegacyExport(patch: { enabled?: boolean; frequency?: "weekly" | "monthly"; dir?: string }) {
  return fetchJSON<LegacyExportConfig>(`/api/legacy/export`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** body: { html } to store + export the document, or { action: "open" } to open the folder. */
export function postLegacyExport(body: { html: string } | { action: "open" }) {
  return fetchJSON<LegacyExportConfig>(`/api/legacy/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function askQuestion(question: string) {
  return fetchJSON<import("./ask").AskAnswer>(`/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
}

export function getLifeProgress() {
  return fetchJSON<Record<string, string[]>>("/api/life");
}

export function saveLifeProgress(progress: Record<string, string[]>) {
  return fetchJSON<Record<string, string[]>>("/api/life", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progress }),
  });
}

// ---- Settle-up and per-child ------------------------------------------------

export interface SettleCounterpart {
  member: import("./household").HouseholdMember;
  rule: import("./settle").SplitRule;
  balance: number;
  since: string | null;
  lines: import("./settle").LedgerLine[];
  entries: import("./settle").SettleEntry[];
}

export function getSettle() {
  return fetchJSON<{ me: string | null; counterparts: SettleCounterpart[] }>("/api/transactions/settle");
}

export function setSplitRule(counterpart: string, rule: import("./settle").SplitRule) {
  return fetchJSON<unknown>("/api/transactions/settle", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ counterpart, rule }) });
}

export function addSettlement(counterpart: string, date: string, amount: number) {
  return fetchJSON<{ id: number }>("/api/transactions/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ counterpart, date, amount }) });
}

export function undoSettlement(id: number) {
  return fetchJSON<unknown>(`/api/transactions/settle?id=${id}`, { method: "DELETE" });
}

export function getChildReport(member: string, month: string) {
  return fetchJSON<{
    child: import("./household").HouseholdMember;
    summary: import("./kids").ChildSummary;
    transactions: { id: number; date: string; amount: number; description: string; category: string | null }[];
  }>(`/api/transactions/kids?member=${encodeURIComponent(member)}&month=${month}`);
}

export function getWellbeing() {
  return fetchJSON<import("./wellbeing").WellbeingEntry[]>("/api/wellbeing");
}

export function saveWellbeing(answers: number[]) {
  return fetchJSON<import("./wellbeing").WellbeingEntry[]>("/api/wellbeing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}

export function getBudgetMoves(month: string) {
  return fetchJSON<import("./budget-moves").BudgetMove[]>(`/api/budgets/moves?month=${month}`);
}

export function addBudgetMove(month: string, move: import("./budget-moves").BudgetMove) {
  return fetchJSON<import("./budget-moves").BudgetMove[]>("/api/budgets/moves", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, ...move }),
  });
}

export function undoBudgetMove(month: string, index?: number) {
  return fetchJSON<import("./budget-moves").BudgetMove[]>(`/api/budgets/moves?month=${month}${index == null ? "" : `&index=${index}`}`, { method: "DELETE" });
}

export function getIncomeSmoothing() {
  return fetchJSON<{ smoothing: import("./smoothing").Smoothing | null }>("/api/budgets/smoothing");
}

export function getOverdraft() {
  return fetchJSON<import("./overdraft").OverdraftCost & { balance: number | null }>("/api/overdraft");
}

export function editTransactions(input: { ids?: number[]; categoryId?: number; remember?: boolean; splits?: { categoryId: number; amount: number }[]; undo?: string }) {
  return fetchJSON<{ success: boolean; undoToken: string | null }>("/api/transactions/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export function getControl(month?:string){return fetchJSON<import("./financial-control").ControlPayload>("/api/control"+(month?`?month=${encodeURIComponent(month)}`:""));}
export function controlAction(body:Record<string,unknown>){return fetchJSON<{success?:boolean;matches?:import("./financial-control").GoalLink[];undoId?:number}>("/api/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}
export function getPreference(key:string,workspaceId:number|null=getActiveWorkspaceIdSync()){return fetchJSON<{value:unknown;revision:number}>(`/api/preferences?key=${encodeURIComponent(key)}`,{headers:{"x-workspace-id":workspaceId==null?"":String(workspaceId)}});}
export function putPreference(key:string,value:unknown,revision:number,workspaceId:number|null=getActiveWorkspaceIdSync()){return fetchJSON<{revision:number}>("/api/preferences",{method:"PUT",headers:{"Content-Type":"application/json","x-workspace-id":workspaceId==null?"":String(workspaceId)},body:JSON.stringify({key,value,revision})});}

export type AccessPayload={enabled:boolean;user:{id:number;name:string;username:string;isAdmin:boolean}|null;users:{id:number;name:string;username:string;isAdmin:number;disabled:number}[];members:{userId:number;workspaceId:number;role:"viewer"|"editor"}[];audit:{id:number;name:string;action:string;workspaceId:number|null;createdAt:string}[]};
export function getAccess(){return fetchJSON<AccessPayload>("/api/access");}
export function accessAction(body:Record<string,unknown>){return fetchJSON<{success?:boolean;id?:number}>("/api/access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}

export function getInstalledAgents() {
  return fetchJSON<Record<"codex" | "gemini" | "opencode" | "kilo", boolean>>("/api/ai/agents");
}

// ---- Manual transactions (add / edit / delete) ----

export type ManualTransactionInput = {
  kind?: "expense" | "income"; amount?: number; date?: string; description?: string; categoryId?: number | null;
  account?: string; memo?: string | null; tags?: string[]; owner?: string | null; excluded?: boolean;
  businessSharePct?: number;
};
const jsonInit = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
export function createManualTransaction(input: ManualTransactionInput) {
  return fetchJSON<{ id: number }>("/api/transactions/manual", jsonInit("POST", input));
}
export function updateTransactionFields(id: number, input: ManualTransactionInput) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/manual?id=${id}`, jsonInit("PATCH", input));
}
export function deleteManualTransaction(id: number) {
  return fetchJSON<{ deleted: ManualTransactionInput }>(`/api/transactions/manual?id=${id}`, jsonInit("DELETE"));
}

export type { ExpenseShare } from "./expense-shares";
const jsonBody = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function getShares(transactionId?: number) {
  return fetchJSON<{ shares: import("./expense-shares").ExpenseShare[] }>(transactionId != null ? `/api/transactions/${transactionId}/shares` : "/api/shares");
}

export function addShare(transactionId: number, person: string, amount: number) {
  return fetchJSON<import("./expense-shares").ExpenseShare>(`/api/transactions/${transactionId}/shares`, jsonBody("POST", { person, amount }));
}

export function setShareSettled(id: number, settled: boolean) {
  return fetchJSON<{ success: boolean }>(`/api/shares/${id}`, jsonBody("PATCH", { settled }));
}

export function settleSharePerson(person: string) {
  return fetchJSON<{ settled: number }>("/api/shares", jsonBody("POST", { settlePerson: person }));
}

export function deleteShare(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/shares/${id}`, { method: "DELETE" });
}

export function getCreditScores() {
  return fetchJSON<{ scores: import("./credit-score").CreditScore[] }>("/api/credit-scores");
}

export function addCreditScore(entry: { date: string; score: number; bureau: string; note?: string }) {
  return fetchJSON<import("./credit-score").CreditScore>("/api/credit-scores", jsonBody("POST", entry));
}

export function deleteCreditScore(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/credit-scores/${id}`, { method: "DELETE" });
}

export function getSavingsDone() {
  return fetchJSON<{ done: import("./money-on-table").DoneSaving[] }>("/api/savings-done");
}

export function setSavingDone(key: string, yearly: number, done: boolean) {
  return fetchJSON<{ success: boolean }>("/api/savings-done", jsonBody("POST", { key, yearly, done }));
}

export interface SpendChange {
  compare: "month" | "year";
  now: { from: string; to: string; total: number };
  before: { from: string; to: string; total: number };
  change: number;
  hasHistory: boolean;
  drivers: import("./spend-change").Driver[];
}

export function getSpendChange(compare: "month" | "year") {
  return fetchJSON<SpendChange>(`/api/spend-change?compare=${compare}`);
}

export type AutoBackupConfig = import("@/server/lib/auto-backup").AutoBackupConfig;

export function getAutoBackup() {
  return fetchJSON<AutoBackupConfig>("/api/backup/auto");
}

export function updateAutoBackup(patch: { enabled?: boolean; frequency?: "daily" | "weekly"; dir?: string; passphrase?: string }) {
  return fetchJSON<AutoBackupConfig>("/api/backup/auto", jsonBody("PATCH", patch));
}

export function autoBackupAction(action: "run" | "open") {
  return fetchJSON<AutoBackupConfig>("/api/backup/auto", jsonBody("POST", { action }));
}
