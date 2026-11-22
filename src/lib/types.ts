import type { Household } from "./household";
export interface Workspace {
  id: number;
  name: string;
  slug: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A person using the household: name, avatar and UI preferences. All profiles share workspaceId's data. */
export interface Profile {
  id: number;
  workspaceId: number;
  name: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  /** The profile's own Pip; null = not picked yet (the legacy art avatar shows). */
  avatarPet: import("./profile-avatar").ProfilePip | null;
  /** An uploaded picture (small JPEG data URL); null = the initial on avatarColor. */
  avatarPhoto: string | null;
  createdAt: string;
}

export interface Transaction {
  id: number;
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  description: string;
  memo: string | null;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  categoryId: number | null;
  categorySource: "ai" | "user" | null;
  aiConfidence: number | null;
  provider: string;
  credentialId: number | null;
  accountLabel: string | null;
  syncRunId: number;
  kind: "expense" | "income" | "transfer";
  /** How much of this row belongs to a business, 0–100. The rest is the household's own spending. */
  businessSharePct: number;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithCategory extends Transaction {
  allocations?: { categoryId: number; amount: number }[];
  categoryName: string | null;
  categoryColor: string | null;
  isExcluded: boolean;
}

export type CategoryKind = "expense" | "income";

export type BudgetMode = "budgeted" | "tracking";

export interface Category {
  id: number;
  parentId: number | null;
  name: string;
  color: string;
  icon: string | null;
  kind: CategoryKind;
  budgetMode: BudgetMode;
  description: string | null;
  needType: NeedType;
  costType: CostType;
}

/** 50/30/20 bucket and how predictable the cost is (only expense leaves use them). */
export type NeedType = "need" | "want" | "saving";
export type CostType = "fixed" | "variable" | "unplanned";

export type CategoryViewMode = "collapsed" | "expanded" | "table";

export type BudgetSource = "own" | "rollup" | "leaf";

export interface SyncRun {
  id: number;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  errorMessage: string | null;
  transactionsAdded: number;
  transactionsUpdated: number;
  scrapeFromDate: string;
  createdAt: string;
}

export interface MonthlySummary {
  month: string;
  amount: number;
}

export interface MerchantSummary {
  name: string;
  amount: number;
  count: number;
}

export interface CategoryBreakdown {
  categoryId: number;
  name: string;
  color: string;
  amount: number;
  count: number;
}

export type BudgetStatus =
  | "plenty-left"
  | "on-track"
  | "heads-up"
  | "over";

export interface CategoryWithData {
  categoryId: number;
  parentId: number | null;
  parentName: string | null;
  isParent: boolean;
  budgetSource: BudgetSource;
  childCount?: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string | null;
  budgetMode: BudgetMode;
  spent: number;
  transactionCount: number;
  topMerchant: string | null;
  budget: number;
  isAutoBudget: boolean;
  vsLastMonth: number | null;
  remaining: number;
  perDayRemaining: number | null;
  percentSpent: number;
  status: BudgetStatus;
  needsReviewCount: number;
  vsTypical: { typical: number; percentDiff: number } | null;
}

export interface DashboardSummary {
  periodTotal: number;
  transactionCount: number;
  monthlySpend: MonthlySummary[];
  topMerchants: MerchantSummary[];
  categoryBreakdown: CategoryBreakdown[];
  categoriesWithData: CategoryWithData[];
  /** Expenses in the range that still have no category. */
  uncategorized: { spent: number; count: number };
  totalBudget: number;
  budgetedSpent: number;
  /** Income in the period, for envelope budgeting. */
  income?: number;
  overallPercentSpent: number;
  timeElapsedPercent: number;
  daysUntilPayday: number;
  paydayDay: number;
  todayLabel: string;
  monthLabel: string;
  pacePhrase: string;
  typicalMonthly: number | null;
}

export interface Budget {
  categoryId: number;
  monthlyAmount: number;
  isAuto: boolean;
}

export type HomeSection =
  | "thisMonth"
  | "cashFlow"
  | "categorySnapshot"
  | "historicalTrend"
  | "recentTransactions"
  | "topMerchants"
  | "needsAttention"
  | "bankHealth"
  | "categories";

export interface HomeThisMonth {
  spent: number;
  budget: number;
  deltaVsLastMonth: number | null;
  pacePhrase: string;
  daysUntilPayday: number;
  timeElapsedPercent: number;
  monthLabel: string;
}

export interface HomeCashFlow {
  income: number;
  expenses: number;
  net: number;
}

export interface HomeCategorySnapshotItem {
  categoryId: number;
  name: string;
  color: string;
  spent: number;
  budget: number;
  percentSpent: number;
}

export interface HomeCategoryBlock extends HomeCategorySnapshotItem {
  /** Lucide icon name (kebab-case), if the category has one. */
  icon: string | null;
  /** Monthly spend, oldest first; the last value is this month. */
  trend: number[];
  topMerchants: { merchant: string; amount: number }[];
}

export interface HomeHistoricalTrendPoint {
  month: string;
  label: string;
  total: number;
  isCurrent: boolean;
}

export interface HomeRecentTransaction {
  id: number;
  date: string;
  description: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  kind: "expense" | "income" | "transfer";
  categoryName: string | null;
  categoryColor: string | null;
  /** For expenses: need, want or saving, from the category. */
  needType?: NeedType | null;
}

export interface HomeTopMerchant {
  name: string;
  total: number;
  count: number;
}

export interface HomeNeedsAttention {
  uncategorized: number;
  lowConfidence: number;
  flagged: number;
}

export interface HomeBankHealthItem {
  /** The connection (bank credential) id: a household can connect the same bank twice. */
  id: number;
  provider: string;
  /** The connection's own name, set only when the same bank is connected more than once. */
  label: string | null;
  providerName: string;
  lastSyncAt: string | null;
  status: "ok" | "stale" | "error" | "never";
  errorMessage: string | null;
  /** The largest gap between the synced balance change and the transactions, when it's over the tolerance. */
  drift?: number | null;
}

export interface HomeSectionError {
  section: HomeSection;
  message: string;
}

export interface HomePayload {
  thisMonth: HomeThisMonth | null;
  cashFlow: HomeCashFlow | null;
  categorySnapshot: HomeCategorySnapshotItem[] | null;
  historicalTrend: HomeHistoricalTrendPoint[] | null;
  recentTransactions: HomeRecentTransaction[] | null;
  topMerchants: HomeTopMerchant[] | null;
  needsAttention: HomeNeedsAttention | null;
  bankHealth: HomeBankHealthItem[] | null;
  categories: HomeCategoryBlock[] | null;
  nextScheduledSync: string | null;
  errors: HomeSectionError[];
}

export type SyncKind = "manual" | "scheduled";

export interface ActivitySnapshot {
  sync: {
    active: boolean;
    since: string | null;
    kind: SyncKind | null;
    stale: boolean;
  };
  scheduler: {
    armed: boolean;
    nextRunAt: string | null;
  };
  ollama: {
    running: boolean;
    spawnedByPenny: boolean;
  };
}

export interface Integration {
  id: number;
  provider: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  transactionCount: number;
  /** True when the user has flagged this bank as needing manual 2FA (showBrowser fallback). */
  requiresManualTwoFactor: boolean;
  /** True when a long-term OTP token is already stored (programmatic 2FA banks only). */
  hasTwoFactorToken: boolean;
}

export interface SetupStatus {
  isConfigured: boolean;
  hasBankCredentials: boolean;
  hasAIProvider: boolean;
}

export interface AppSettings {
  monthsToSync: number;
  aiProvider: "claude" | "ollama" | "codex" | "gemini" | "opencode" | "kilo" | "none";
  ollamaUrl: string;
  ollamaModel: string;
  showBrowser: boolean;
  paydayDay: number;
  monthlyTarget: number | null;
  autoSyncEnabled: boolean;
  autoSyncTime: string;
  language: "en" | "he";
  displayName: string;
  household: Household;
}

export type BankProvider =
  | "isracard"
  | "cal"
  | "max"
  | "amex"
  | "hapoalim"
  | "leumi"
  | "mizrahi"
  | "discount"
  | "mercantile"
  | "beinleumi"
  | "otsarHahayal"
  | "union"
  | "pagi"
  | "yahav"
  | "massad"
  | "beyahadBishvilha"
  | "behatsdaa"
  | "oneZero"
  | "openBanking";

export interface CredentialField {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  exactLength?: number;
  numeric?: boolean;
}

export type BankKind = "bank" | "card";

export interface BankProviderInfo {
  id: BankProvider;
  name: string;
  kind: BankKind;
  color: string;
  blurb: string;
  /** Domain used to fetch the favicon logo via Google's S2 API. */
  domain: string;
  credentialFields: CredentialField[];
  enabled: boolean;
  /**
   * True when the underlying scraper supports OTP-driven login flows that we
   * can drive in-process. Currently only OneZero — Hapoalim/Leumi/etc. expose
   * the methods on the base interface but no concrete implementation, so 2FA
   * on those banks falls back to the manual (showBrowser) path.
   */
  supportsProgrammaticTwoFactor?: boolean;
}

export interface OllamaModelInfo {
  name: string;
  sizeGb: number;
  description: string;
  recommended?: boolean;
}

export const RECOMMENDED_OLLAMA_MODELS: OllamaModelInfo[] = [
  {
    name: "llama3.2:3b",
    sizeGb: 2.0,
    description: "Recommended. Fast and accurate enough for categorizing.",
    recommended: true,
  },
  {
    name: "llama3.2:1b",
    sizeGb: 1.3,
    description: "Smallest and fastest. Slightly less accurate.",
  },
  {
    name: "llama3.1:8b",
    sizeGb: 4.7,
    description: "Higher quality, slower, larger download.",
  },
  {
    name: "qwen2.5:3b",
    sizeGb: 1.9,
    description: "Alternative 3B model from Alibaba.",
  },
];

export const BANK_PROVIDERS: BankProviderInfo[] = [
  {
    // Not a bank of its own: any NextGenPSD2 / Bank of Israel XS2A endpoint.
    id: "openBanking",
    name: "Open Banking",
    kind: "bank",
    color: "#0B5FFF",
    blurb: "Read accounts through the open banking API",
    domain: "boi.org.il",
    credentialFields: [
      {
        key: "baseUrl",
        label: "Open banking API base URL",
        type: "text",
        placeholder: "https://xs2a.example.co.il",
        hint: "The XS2A endpoint of your bank or aggregator, without /v1.",
      },
      {
        key: "token",
        label: "Access token",
        type: "password",
        placeholder: "Bearer token from the consent",
        hint: "The token issued after you approved the account information consent.",
      },
      {
        key: "consentId",
        label: "Consent ID (optional)",
        type: "text",
        hint: "Sent as Consent-ID on every request when the endpoint expects it.",
      },
    ],
    enabled: true,
  },
  {
    id: "isracard",
    name: "Isracard",
    kind: "card",
    color: "#E50019",
    blurb: "Israeli Mastercard / Visa",
    domain: "isracard.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        hint: "Your 9-digit Israeli national ID (Teudat Zehut). Not your card number.",
        maxLength: 9,
        numeric: true,
      },
      {
        key: "card6Digits",
        label: "Last 6 Digits of Your Card",
        type: "text",
        placeholder: "e.g. 123456",
        hint: "The last 6 digits of your Isracard credit card number. This is NOT your ID.",
        exactLength: 6,
        numeric: true,
      },
      {
        key: "password",
        label: "Isracard Password",
        type: "password",
        placeholder: "Password you use on digital.isracard.co.il",
        hint: "The same password you use to log in on the Isracard website.",
      },
    ],
    enabled: true,
  },
  {
    id: "cal",
    name: "Visa Cal",
    kind: "card",
    color: "#1B4E97",
    blurb: "Cal-branded cards",
    domain: "cal-online.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "max",
    name: "Max",
    kind: "card",
    color: "#FF6B00",
    blurb: "Formerly Leumi Card",
    domain: "max.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "hapoalim",
    name: "Bank Hapoalim",
    kind: "bank",
    color: "#E2231A",
    blurb: "Includes Poalim wallets",
    domain: "bankhapoalim.co.il",
    credentialFields: [
      { key: "userCode", label: "User Code", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "leumi",
    name: "Bank Leumi",
    kind: "bank",
    color: "#1976A4",
    blurb: "Personal & business accounts",
    domain: "leumi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "mizrahi",
    name: "Mizrahi Tefahot",
    kind: "bank",
    color: "#0066B3",
    blurb: "Personal & mortgage banking",
    domain: "mizrahi-tefahot.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "discount",
    name: "Bank Discount",
    kind: "bank",
    color: "#2E9C5C",
    blurb: "Personal & business accounts",
    domain: "discountbank.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
      {
        key: "num",
        label: "Identifier Code",
        type: "text",
        placeholder: "Your קוד מזהה",
        hint: "The 'קוד מזהה' you set up for Discount online banking. May contain letters and numbers, not the same as your account number.",
      },
    ],
    enabled: true,
  },
  {
    id: "mercantile",
    name: "Mercantile Discount",
    kind: "bank",
    color: "#1B6A3C",
    blurb: "Discount-owned subsidiary",
    domain: "mercantile.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
      {
        key: "num",
        label: "Identifier Code",
        type: "text",
        placeholder: "Your קוד מזהה",
        hint: "The 'קוד מזהה' you set up for Mercantile online banking. May contain letters and numbers, not the same as your account number.",
      },
    ],
    enabled: true,
  },
  {
    id: "beinleumi",
    name: "First International (FIBI)",
    kind: "bank",
    color: "#C8102E",
    blurb: "Beinleumi / FIBI",
    domain: "fibi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "otsarHahayal",
    name: "Otsar Hahayal",
    kind: "bank",
    color: "#7A1F2B",
    blurb: "FIBI subsidiary (merged 2020)",
    domain: "fibi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "pagi",
    name: "Bank Pagi",
    kind: "bank",
    color: "#9F2241",
    blurb: "Hapoalim's religious-community branch",
    domain: "bankpagi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "yahav",
    name: "Bank Yahav",
    kind: "bank",
    color: "#0F4D8C",
    blurb: "Public-sector employees · 6 months history",
    domain: "bank-yahav.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      {
        key: "nationalID",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "massad",
    name: "Bank Massad",
    kind: "bank",
    color: "#2B5F2B",
    blurb: "Teachers' bank",
    domain: "bankmassad.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "union",
    name: "Union Bank",
    kind: "bank",
    color: "#003F87",
    blurb: "Merged into Mizrahi-Tefahot (2019)",
    domain: "unionbank.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "amex",
    name: "American Express IL",
    kind: "card",
    color: "#006FCF",
    blurb: "Isracard-issued Amex cards",
    domain: "americanexpress.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      {
        key: "card6Digits",
        label: "Last 6 Digits of Your Card",
        type: "text",
        placeholder: "e.g. 123456",
        exactLength: 6,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "beyahadBishvilha",
    name: "Beyahad Bishvilha",
    kind: "card",
    color: "#7E3F8F",
    blurb: "Histadrut benefits / credit",
    domain: "beyahad-bishvilha.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "behatsdaa",
    name: "Behatsdaa",
    kind: "card",
    color: "#6E3A7A",
    blurb: "Histadrut subsidies / credit",
    domain: "behatsdaa.org.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "oneZero",
    name: "One Zero",
    kind: "bank",
    color: "#000000",
    blurb: "Programmatic 2FA via SMS code",
    domain: "onezerobank.com",
    credentialFields: [
      {
        key: "email",
        label: "Email",
        type: "email",
        placeholder: "you@example.com",
        hint: "The email you use to sign in to One Zero.",
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        placeholder: "Your One Zero password",
      },
      {
        key: "phoneNumber",
        label: "Phone number",
        type: "tel",
        placeholder: "+972501234567",
        hint: "Where the SMS one-time code will be sent. International format including the country code.",
      },
    ],
    enabled: true,
    supportsProgrammaticTwoFactor: true,
  },
];

export interface ExcludedMerchant {
  id: number;
  provider: string;
  merchantKey: string;
  createdAt: string;
}

export interface OverviewTotals {
  income: number;
  expenses: number;
  net: number;
  /** net / income, or null with no income. */
  savingsRate: number | null;
}

export interface OverviewCategoryRow {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  /** Spend per 50/30/20 bucket; sub-categories can sit in different buckets than their parent. */
  byNeed: Partial<Record<NeedType, number>>;
  spent: number;
  /** YYYY-MM -> spent, for every month in the period. */
  monthly: Record<string, number>;
  previous: number;
  lastYear: number;
}

export interface OverviewPayload {
  period: { kind: "month" | "quarter" | "half" | "year"; year: number; startMonth: number; from: string; to: string; months: string[] };
  totals: OverviewTotals;
  previous: OverviewTotals;
  lastYear: OverviewTotals;
  monthly: { month: string; income: number; expenses: number }[];
  byNeed: Record<NeedType, number>;
  byCost: Record<CostType, number>;
  uncategorized: number;
  categories: OverviewCategoryRow[];
}

export interface Quote {
  symbol: string;
  name: string;
  /** In `currency` (Tel Aviv agorot already converted to ILS). */
  price: number;
  currency: string;
  /** Fractions, e.g. 0.012 = +1.2%. Null when there is no base. */
  changeDay: number | null;
  changeYtd: number | null;
  change12m: number | null;
  /** About 52 closes over the past year, oldest first. */
  series: number[];
  asOf: string;
  /** True when Yahoo could not be reached and this is the last saved quote. */
  stale: boolean;
}

export interface MarketsPayload {
  items: { symbol: string; key: string; group: string; quote: Quote | null }[];
}

export const ASSET_TYPES = [
  "cash", "deposit", "bond", "stock", "fund", "study_fund", "provident", "pension",
  "real_estate", "business", "metal", "crypto", "vehicle", "other",
] as const;
export const LIABILITY_TYPES = ["mortgage", "loan", "credit", "other_liability"] as const;
export type AssetType = (typeof ASSET_TYPES)[number] | (typeof LIABILITY_TYPES)[number];

export interface AssetInput {
  name: string;
  type: AssetType;
  currency: string;
  symbol: string | null;
  quantity: number | null;
  manualValue: number | null;
  costBasis: number | null;
  /** ILS per unit of `currency` when bought, for a foreign holding; splits its gain into price and exchange rate. */
  costFx?: number | null;
  liquid: boolean;
  note: string | null;
  /** Management fees, % a year (pension, study and provident funds). */
  feeDeposit: number | null;
  feeBalance: number | null;
  monthlyDeposit: number | null;
  /** Debts: yearly interest % and monthly payment. */
  interestRate: number | null;
  monthlyPayment: number | null;
  /** Fund in the Finance Ministry's public data, for pension / study / provident funds. */
  fundId?: number | null;
  fundSource?: FundSource | null;
}

export interface Asset extends AssetInput {
  id: number;
  isLiability: boolean;
  /** "bank" = a synced account balance, updated automatically and not editable. */
  source?: "bank";
  /** For synced balances: the bank or card company id, so the name can be shown in the user's language. */
  provider?: string;
  /** For synced balances: the account number, to list its transactions. */
  accountNumber?: string;
  updatedAt?: string;
  /** Current value in its own currency and in ILS (null if no price or FX rate). */
  value: number | null;
  valueIls: number | null;
  /** Unrealised gain in ILS, when a cost basis is set. */
  gainIls: number | null;
  /** The part of `gainIls` that came from the exchange rate (needs `costFx`). */
  fxGainIls?: number | null;
  quote: Quote | null;
  fund?: FundComparison | null;
}

export interface AssetsPayload {
  assets: Asset[];
  totals: {
    assets: number;
    liquid: number;
    liabilities: number;
    /** 25% of unrealised gains on taxable holdings (not pension, study fund or provident). */
    deferredTax: number;
    netWorth: number;
    /** Net worth that can fund early retirement: liquid assets minus non-mortgage debt and deferred tax. */
    liquidNetWorth: number;
  };
  history: { date: string; netWorth: number; manual?: boolean }[];
  benchmarks: { symbol: string; change12m: number | null; changeYtd: number | null }[];
}

export interface FiPayload {
  /** Averages over the last up-to-12 complete months that have transactions. */
  monthlyIncome: number;
  monthlyExpenses: number;
  monthsOfData: number;
  netWorth: number;
  liquidNetWorth: number;
  hasAssets: boolean;
  /** Cash and deposits, for the emergency fund and the cash forecast. */
  cashReserve: number;
  /** Unrealised losses on taxable holdings, which can offset gains this year. */
  taxableLosses: number;
  deferredTax: number;
  /** Spending per category, last 12 complete months vs the 12 before. */
  inflation: {
    rate: number | null;
    categories: { categoryId: number; name: string; color: string; previous: number; current: number; change: number; weight: number }[];
  };
}

export interface Goal {
  openingSavedAmount?: number;
  id: number;
  name: string;
  targetAmount: number;
  /** YYYY-MM */
  targetDate: string;
  savedAmount: number;
  /** "vacation" goals carry a trip plan; targetAmount is its lines' total and targetDate its start month. */
  kind?: "general" | "vacation";
  trip?: import("./trip").Trip | null;
  /** Vacation spending recorded between the trip's dates (Travel category and its subcategories). */
  actual?: number;
  /** Custom ("general") goal extras, kept in details. */
  icon?: string | null;
  color?: import("./plan").GoalColor | null;
  /** Planned monthly contribution, if the user set one. */
  monthly?: number | null;
  /** false when the user set no date and targetDate was derived from the monthly contribution. */
  dated?: boolean;
}

export const POLICY_KINDS = ["health", "shaban", "life", "mortgage_life", "disability", "long_term_care", "home", "car", "travel", "other"] as const;

export const INSURANCE_DOC_KINDS = ["policy", "appendix", "renewal", "claim", "other"] as const;

export interface InsurancePolicy {
  id: number;
  name: string;
  kind: (typeof POLICY_KINDS)[number];
  provider: string | null;
  /** The monthly cost. A yearly premium is stored as premium / 12. */
  monthlyPremium: number;
  /** YYYY-MM the policy renews, if known. */
  renewalMonth?: string | null;
  /** Who the policy covers, free text (a name); empty means the whole household. */
  insured?: string | null;
  policyNumber?: string | null;
  /** Account number the premium is charged to; empty matches any account. */
  paymentAccount?: string | null;
  /** Text that identifies this policy on the statement, e.g. "הפניקס". */
  matchPattern?: string | null;
  /** YYYY-MM-DD. */
  startDate?: string | null;
  /** YYYY-MM-DD; drives the renewal reminder when set. */
  endDate?: string | null;
  /** Sum insured. */
  coverage?: number | null;
  deductible?: number | null;
  agentName?: string | null;
  agentPhone?: string | null;
  notes?: string | null;
  archived?: boolean;
}

export interface InsuranceDocument {
  id: number;
  policyId: number;
  fileName: string;
  originalName: string;
  mime: string;
  size: number;
  kind: (typeof INSURANCE_DOC_KINDS)[number];
  uploadedAt: string;
}

export interface InsurancePayments {
  /** Gross premium charges in the last 12 months. */
  last12: number;
  count: number;
  lastDate: string | null;
  lastAmount: number | null;
}

export interface InsurancePolicyView extends InsurancePolicy {
  archived: boolean;
  documents: InsuranceDocument[];
  payments: InsurancePayments;
  renewalSoon: boolean;
}

/** Insurance-looking charges that no policy explains yet. */
export interface InsuranceUnlinkedCharge {
  description: string;
  account: string;
  count: number;
  total: number;
  lastDate: string;
  lastAmount: number;
}

export interface InsurancePayload {
  policies: InsurancePolicyView[];
  unlinked: InsuranceUnlinkedCharge[];
  totals: {
    count: number;
    monthly: number;
    paidLast12: number;
    renewalsSoon: number;
    documents: number;
  };
  /** Account numbers that appear in transactions, for the paying-account picker. */
  accounts: string[];
}

export interface PlanPayload {
  plan: import("./plan").FinancialPlan;
  goals: Goal[];
  policies: InsurancePolicy[];
}

export type FundSource = "gemel" | "pension";

/** One fund from the Finance Ministry's Gemel-Net / Pensia-Net monthly report. Percentages, not fractions. */
export interface Fund {
  id: number;
  source: FundSource;
  name: string;
  company: string;
  classification: string;
  specialization: string | null;
  /** YYYYMM of the report. */
  period: number;
  /** Average fees actually charged across the fund's members, % a year. */
  feeBalance: number | null;
  feeDeposit: number | null;
  ytd: number | null;
  avg3y: number | null;
  avg5y: number | null;
  sharpe: number | null;
  /** ₪ millions. */
  totalAssets: number | null;
}

export interface FundComparison {
  fund: Fund;
  /** Medians across funds of the same kind (and track, for provident/study funds). */
  peers: { count: number; feeBalance: number | null; feeDeposit: number | null; avg5y: number | null; avg3y: number | null };
  /** 1 = best 5-year return among peers. */
  rank5y: number | null;
}

// Tags and owner on a transaction (declaration-merged into the interface above).
export interface TransactionWithCategory {
  /** Household member id or "shared"; null = not set. */
  owner?: string | null;
  tags?: string[];
}

// Home details for real_estate assets (merged into AssetInput / Asset above).
export interface AssetInput {
  city?: string | null;
  street?: string | null;
  rooms?: number | null;
  sizeM2?: number | null;
  purchasePrice?: number | null;
  /** "YYYY-MM" */
  purchaseMonth?: string | null;
}

/** "index" = purchase price revalued by the CBS dwelling price index. */
export interface PropertyEstimate {
  method: "index";
  value: number;
  change: number;
  indexMonth: string;
}

export interface Asset {
  estimate?: PropertyEstimate | null;
  /** When the ILS value last changed (snapshot date, null = today) and by how much. */
  change?: { since: string | null; prevIls: number | null; changeIls: number | null; changePct: number | null } | null;
}
