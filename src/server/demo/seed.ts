import "server-only";

import type Database from "better-sqlite3";
import { addDays, addMonths, israelToday, monthDate, monthKey } from "@/server/lib/date-utils";
import { isDemoMode } from "./mode";

/** Set once the demo rows are in, so a second request (or a restart) never seeds twice. */
const MARKER = "demo_seeded";

interface Account {
  account: string;
  provider: string;
}

interface TxOptions {
  category?: string;
  kind?: "expense" | "income" | "transfer";
  status?: "completed" | "pending";
  type?: "normal" | "installments";
  installment?: { number: number; total: number };
  owner?: string | null;
  businessShare?: number;
  excluded?: boolean;
  needsReview?: boolean;
  /** Card statement date. Defaults to the transaction date (bank rows). */
  billingDate?: string;
  /** A purchase abroad: its amount in the original currency (the row's amount stays in shekels). */
  original?: { amount: number; currency: string };
}

const DANA_BANK: Account = { account: "12-345-000001", provider: "hapoalim" };
const YOAV_BANK: Account = { account: "10-800-000002", provider: "leumi" };
const DANA_CARD: Account = { account: "0001", provider: "isracard" };
const YOAV_CARD: Account = { account: "0002", provider: "max" };
const CASH: Account = { account: "cash", provider: "cash" };

const DANA = "dana";
const YOAV = "yoav";

/**
 * Seeds the demo household into a fresh database. Returns true when it wrote rows.
 * Safe to call on every start: a marker and an existing transaction both stop it.
 */
export function ensureDemoData(db: Database.Database): boolean {
  if (!isDemoMode()) return false;
  if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(MARKER)) return false;
  if (db.prepare("SELECT 1 FROM transactions LIMIT 1").get()) {
    markSeeded(db);
    return false;
  }
  db.transaction(() => seed(db))();
  return true;
}

function markSeeded(db: Database.Database): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(MARKER, new Date().toISOString());
}

function seed(db: Database.Database): void {
  const today = israelToday();
  const ws = (db.prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as { id: number } | undefined)?.id;
  if (ws == null) throw new Error("demo seed needs the workspace created by the migrations");

  db.prepare("UPDATE workspaces SET name = ?, avatar_emoji = ?, updated_at = datetime('now') WHERE id = ?")
    .run("משק בית דנה ויואב", "@fox", ws);

  seedProfiles(db, ws);
  seedSettings(db, ws, today);
  // The connection rows first: every synced row is linked to the connection that brought it in.
  const credentials = seedConnections(db, ws, today);

  const runs = new Map<string, number>();
  const runId = (provider: string): number => {
    const existing = runs.get(provider);
    if (existing != null) return existing;
    const id = Number(
      db.prepare(
        `INSERT INTO sync_runs (workspace_id, provider, credential_id, started_at, completed_at, status, scrape_from_date)
         VALUES (?, ?, ?, ?, ?, 'completed', ?)`
      ).run(ws, provider, credentials.get(provider) ?? null, `${today}T06:00:00`, `${today}T06:01:00`, addMonths(today, -6)).lastInsertRowid
    );
    runs.set(provider, id);
    return id;
  };
  // Open banking has no rows of its own in the demo (the bank's rows are the hapoalim ones), but without a
  // completed run it would read as "never synced" and the app would nudge the visitor to sync.
  runId("openBanking");

  const categories = new Map(
    (
      db
        .prepare(
          `SELECT id, name FROM categories
           WHERE workspace_id = ? AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)`
        )
        .all(ws) as { id: number; name: string }[]
    ).map((c) => [c.name, c.id])
  );
  const categoryId = (name: string | undefined) => (name ? categories.get(name) ?? null : null);

  let seq = 0;
  const add = (account: Account, date: string, description: string, amount: number, options: TxOptions = {}): number | null => {
    // Demo data never runs ahead of today: the forecast should look forward on its own.
    if (date > today) return null;
    const kind = options.kind ?? (amount > 0 ? "income" : "expense");
    const category = categoryId(options.category);
    const id = Number(
      db
        .prepare(
          `INSERT INTO transactions (
             workspace_id, account_number, date, processed_date, original_amount, original_currency,
             charged_amount, charged_currency, description, type, status, category_id, category_source,
             provider, credential_id, sync_run_id, dedup_hash, kind, needs_review, is_excluded, owner, business_share_pct,
             installment_number, installment_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ILS', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ws,
          account.account,
          date,
          options.billingDate ?? date,
          options.original?.amount ?? amount,
          options.original?.currency ?? "ILS",
          amount,
          description,
          options.type ?? "normal",
          options.status ?? "completed",
          category,
          category ? "user" : null,
          account.provider,
          credentials.get(account.provider) ?? null,
          runId(account.provider),
          `demo:${++seq}`,
          kind,
          options.needsReview ? 1 : 0,
          options.excluded ? 1 : 0,
          options.owner ?? null,
          options.businessShare ?? 0,
          options.installment?.number ?? null,
          options.installment?.total ?? null
        ).lastInsertRowid
    );
    return id;
  };

  const months = [-4, -3, -2, -1, 0].map((k) => monthKey(today, k));
  let tripTxn: number | null = null;
  let businessTxn: number | null = null;

  months.forEach((month, index) => {
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const day = (d: number) => monthDate(year, monthNumber, d);
    const next = monthKey(today, -4 + index + 1);
    const statement = monthDate(Number(next.slice(0, 4)), Number(next.slice(5, 7)), 10);

    // Money in.
    add(DANA_BANK, day(1), 'משכורת - חברת אלפא בע"מ', 16_500, { category: "Salary", kind: "income", owner: DANA });
    add(YOAV_BANK, day(9), "משכורת - בטא טכנולוגיות", 13_800, { category: "Salary", kind: "income", owner: YOAV });

    // Regular bank debits: the things the forecast should learn.
    add(YOAV_BANK, day(2), "משכנתא - בנק לאומי", -5_200, { category: "Mortgage", owner: YOAV });
    add(DANA_BANK, day(15), "עיריית תל אביב - ארנונה", -680, { category: "Arnona", owner: DANA });
    add(DANA_BANK, day(18), "מי אביבים - מים", -185, { category: "Water", owner: DANA });
    add(DANA_BANK, day(20), "חברת החשמל", -between(380, 620), { category: "Electricity", owner: DANA });
    add(YOAV_BANK, day(12), "הוראת קבע לחסכון", -1_000, { category: "Savings", owner: YOAV });
    add(YOAV_BANK, day(6), "הפניקס - ביטוח דירה", -120, { category: "Insurance", owner: YOAV });
    add(YOAV_BANK, day(7), "מנורה - ביטוח חיים", -85, { category: "Life Insurance", owner: YOAV });
    add(DANA_BANK, day(8), "כלל - ביטוח רכב", -210, { category: "Car Insurance", owner: DANA });
    add(DANA_BANK, day(14), "פרטנר תקשורת - סלולר", -99, { category: "Mobile Phone", owner: DANA });

    // Between the two of them, both sides of a transfer.
    add(DANA_BANK, day(4), "העברה לחשבון יואב", -4_000, { kind: "transfer", category: "Transfers", owner: DANA });
    add(YOAV_BANK, day(4), "העברה מחשבון דנה", 4_000, { kind: "transfer", category: "Transfers", owner: YOAV });

    // Card purchases, charged on the next statement.
    for (let i = 0; i < 14; i++) {
      const [name, category, min, max] = pick(SHOPS);
      add(DANA_CARD, day(1 + Math.floor(rand() * 27)), name, -between(min, max), {
        category, owner: DANA, billingDate: statement,
      });
    }
    for (let i = 0; i < 10; i++) {
      const [name, category, min, max] = pick(SHOPS);
      add(YOAV_CARD, day(1 + Math.floor(rand() * 27)), name, -between(min, max), {
        category, owner: YOAV, billingDate: statement,
      });
    }

    // Subscriptions look the same every month, so recurring detection can find them.
    add(DANA_CARD, day(3), "נטפליקס", -54.9, { category: "Subscriptions", owner: DANA, billingDate: statement });
    add(DANA_CARD, day(3), "ספוטיפיי", -23.9, { category: "Subscriptions", owner: DANA, billingDate: statement });
    add(DANA_CARD, day(10), "אפל אייפון 15", -350, {
      category: "Shopping", owner: DANA, billingDate: statement, type: "installments",
      installment: { number: index + 1, total: 12 },
    });
    add(YOAV_CARD, day(5), "הולמס פלייס", -289, { category: "Sports & Hobbies", owner: YOAV, billingDate: statement });

    // A few cash rows, with owners, so the split views have something to show.
    add(CASH, day(16), "שוק הכרמל", -between(90, 180), { category: "Groceries", owner: DANA });
    add(CASH, day(22), "מונית", -between(45, 80), { category: "Transport", owner: YOAV });
    add(CASH, day(25), "מתנה ליום הולדת", -150, { category: "Gifts & Events", owner: DANA });

    if (index === 3) {
      tripTxn = add(DANA_CARD, day(20), "טיסות ליפן - אל על", -3_200, {
        category: "Travel", owner: DANA, billingDate: statement,
      });
    }
    if (index === 4) {
      const businessDay = day(16);
      if (businessDay <= today) {
        businessTxn = add(DANA_CARD, businessDay, "Adobe Creative Cloud", -119, {
          category: "Subscriptions", owner: DANA, billingDate: statement, businessShare: 100,
        });
        add(DANA_BANK, businessDay, "תשלום מלקוח - סטודיו דנה", 2_500, {
          category: "Freelance & Side Income", kind: "income", owner: DANA, businessShare: 100,
        });
      }
      add(DANA_CARD, day(2), "חנות לא מזוהה", -180, { owner: DANA, billingDate: statement, needsReview: true });
      add(YOAV_CARD, day(4), "ATS", -60, { owner: YOAV, billingDate: statement, needsReview: true });
      // Two purchases abroad, so the transactions table shows original amounts beside shekels.
      add(YOAV_CARD, day(6), "AMAZON.COM", -186.4, { category: "Furniture", owner: YOAV, billingDate: statement, original: { amount: -49.99, currency: "USD" } });
      add(DANA_CARD, day(9), "ZALANDO", -158.2, { category: "Clothing & Shoes", owner: DANA, billingDate: statement, original: { amount: -39.9, currency: "EUR" } });
      // Still pending: not on a statement yet, so the card forecast expects it on the next one.
      add(DANA_CARD, today, "Zara", -239, {
        category: "Clothing & Shoes", owner: DANA, status: "pending", billingDate: statement,
      });
    }
  });

  // One refund, so the charts also know about positive expenses (still kind 'expense', like a real refund).
  add(DANA_CARD, addDays(today, -20), "החזר - זארה", 129, {
    kind: "expense", category: "Clothing & Shoes", owner: DANA, billingDate: addDays(today, -10),
  });

  // Card statements leave the bank that pays the card, one month after the purchases.
  const cardTotals = db
    .prepare(
      `SELECT account_number AS account, substr(processed_date, 1, 10) AS billingDate, SUM(charged_amount) AS total
       FROM transactions
       WHERE workspace_id = ? AND provider IN (?, ?) AND kind = 'expense' AND status = 'completed'
       GROUP BY account_number, billingDate
       HAVING total < 0`
    )
    .all(ws, DANA_CARD.provider, YOAV_CARD.provider) as { account: string; billingDate: string; total: number }[];
  for (const bill of cardTotals) {
    const toDana = bill.account === DANA_CARD.account;
    add(toDana ? DANA_BANK : YOAV_BANK, bill.billingDate, toDana ? "ישראכרט" : "מקס איט פיננסים", Math.round(bill.total * 100) / 100, {
      kind: "transfer", category: "Transfers", owner: toDana ? DANA : YOAV,
    });
  }

  // Tags make the tag split and the tag filter non-empty.
  const tag = db.prepare("INSERT OR IGNORE INTO transaction_tags (workspace_id, transaction_id, tag) VALUES (?, ?, ?)");
  if (tripTxn) tag.run(ws, tripTxn, "חופשה");
  if (businessTxn) tag.run(ws, businessTxn, "עסק");

  seedAccounts(db, ws);
  seedBudgets(db, ws, categoryId);
  seedPlanned(db, ws, today, categoryId);
  seedTrackers(db, ws, today, categoryId);
  seedInsurance(db, ws);
  seedAssets(db, ws, today);
  seedGoals(db, ws, today);
  seedPensionConnections(db, ws, today);

  db.prepare("UPDATE workspaces SET updated_at = datetime('now') WHERE id = ?").run(ws);
  markSeeded(db);
}

// Deterministic "random", so every demo looks the same.
let random = 20261117;
const rand = () => {
  random = (random * 16807) % 2147483647;
  return random / 2147483647;
};
const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) / 100;
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];

const SHOPS = [
  ["שופרסל דיל", "Groceries", 180, 520],
  ["רמי לוי", "Groceries", 250, 700],
  ["סופר פארם", "Health", 40, 180],
  ["קפה לנדוור", "Coffee & Cafes", 35, 120],
  ["מקדונלדס", "Restaurants", 45, 110],
  ["פז דלק", "Fuel", 200, 380],
  ["זארה", "Clothing & Shoes", 120, 450],
  ["איקאה", "Furniture", 90, 600],
  ["סינמה סיטי", "Entertainment", 80, 160],
] as const;

/**
 * The rows the connection screens read: Settings › Banks shows one tile per credential, and the
 * sidebar's sync status is empty without them. The ciphertext is a fixed placeholder on purpose:
 * demo mode never decrypts it, because sync and sign-in are switched off there.
 */
function seedConnections(db: Database.Database, ws: number, today: string): Map<string, number> {
  const insert = db.prepare(
    `INSERT INTO bank_credentials
       (workspace_id, provider, label, credentials_encrypted, iv, auth_tag, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const placeholder = Buffer.from("penny-demo");
  const connections: [string, string][] = [
    [DANA_BANK.provider, "דנה · הפועלים"],
    [YOAV_BANK.provider, "יואב · לאומי"],
    [DANA_CARD.provider, "ישראכרט"],
    [YOAV_CARD.provider, "מקס"],
    ["openBanking", "הפועלים · חיבור פתוח"],
  ];
  const ids = new Map<string, number>();
  for (const [provider, label] of connections) {
    const id = Number(
      insert.run(ws, provider, label, placeholder, Buffer.alloc(16), Buffer.alloc(16),
        `${today}T05:55:00`, `${today}T06:01:00`).lastInsertRowid
    );
    ids.set(provider, id);
  }
  return ids;
}

/** Investment houses that are wired to a scraper, shown as connected with a last sync. */
function seedPensionConnections(db: Database.Database, ws: number, today: string): void {
  const insert = db.prepare(
    `INSERT INTO pension_connections
       (workspace_id, fund_id, credentials_encrypted, iv, auth_tag, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const placeholder = Buffer.from("penny-demo");
  for (const fundId of ["meitav", "harel", "migdal"]) {
    insert.run(ws, fundId, placeholder, Buffer.alloc(16), Buffer.alloc(16), `${today}T06:30:00`);
  }
}

function seedProfiles(db: Database.Database, ws: number): void {
  const existing = db.prepare("SELECT id FROM profiles WHERE workspace_id = ? ORDER BY id").all(ws) as { id: number }[];
  const insert = db.prepare("INSERT INTO profiles (workspace_id, name, avatar_emoji, avatar_color) VALUES (?, ?, ?, ?)");
  const update = db.prepare("UPDATE profiles SET name = ?, avatar_emoji = ?, avatar_color = ? WHERE id = ?");
  if (existing[0]) update.run("דנה", "@fox", "#7c5cff", existing[0].id);
  else insert.run(ws, "דנה", "@fox", "#7c5cff");
  if (existing.length < 2) insert.run(ws, "יואב", "@bear", "#2fa7c9");
}

function seedSettings(db: Database.Database, ws: number, today: string): void {
  const setWs = db.prepare(
    `INSERT INTO workspace_settings (workspace_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const setGlobal = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  setWs.run(ws, "months_to_sync", "6");
  setWs.run(ws, "payday_day", "10");
  setWs.run(ws, "monthly_target", "18000");
  setWs.run(ws, "cash_reserve", "30000");
  setWs.run(ws, "account_owners", JSON.stringify({
    [DANA_BANK.account]: DANA,
    [YOAV_BANK.account]: YOAV,
    [DANA_CARD.account]: DANA,
    [YOAV_CARD.account]: YOAV,
  }));
  setWs.run(ws, "forecast_card_banks", JSON.stringify({
    [DANA_CARD.account]: DANA_BANK.account,
    [YOAV_CARD.account]: YOAV_BANK.account,
  }));
  setWs.run(ws, "household", JSON.stringify({
    members: [
      { id: DANA, name: "דנה", role: "me", birthYear: 1988 },
      { id: YOAV, name: "יואב", role: "partner", birthYear: 1986 },
      { id: "noa", name: "נועה", role: "child", birthYear: 2016 },
    ],
    incomeShape: "salaried",
    moneyStyle: "mixed",
    gentleMode: false,
    gentleSuggestionDismissed: false,
    welcomeDismissed: true,
    events: [],
  }));
  setWs.run(ws, "financial_plan", JSON.stringify({
    monthStartDay: 10,
    birthYear: 1988,
    retirementAge: 67,
    emergencyMonths: 6,
    allocation: { equity: 70, bonds: 20, cash: 10 },
    taxDone: {},
    simpleMode: false,
    wheelPaging: false,
    checkin: { lastWeek: null, streak: 0 },
    events: [],
    profile: {
      situation: "family", householdSize: 3, goal: "save", goalNote: "חופשה משפחתית ביפן",
      confidence: "intermediate", detail: "standard", onboarded: true,
    },
    homeStyle: "classic",
    kids: [{ memberId: "noa", stateValue: 18500, track: "medium", doubling: true, extraMonthly: 300, returnPct: 5, assetIds: [] }],
  }));

  setGlobal.run("language", "he");
  setGlobal.run("ai_provider", "none");
  // A new install would be sent to onboarding; the demo household is already set up.
  setGlobal.run("onboarding_step", "complete");
  setGlobal.run("demo_started_on", today);
}

function seedAccounts(db: Database.Database, ws: number): void {
  const balance = db.prepare(
    `INSERT INTO account_balances (workspace_id, provider, account_number, balance, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, provider, account_number) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`
  );
  balance.run(ws, DANA_BANK.provider, DANA_BANK.account, 18_450);
  balance.run(ws, YOAV_BANK.provider, YOAV_BANK.account, 6_230);
  balance.run(ws, DANA_CARD.provider, DANA_CARD.account, -2_150);
  balance.run(ws, YOAV_CARD.provider, YOAV_CARD.account, -1_340);
}

function seedBudgets(db: Database.Database, ws: number, categoryId: (name: string) => number | null): void {
  const budget = db.prepare(
    `INSERT INTO budgets (workspace_id, category_id, monthly_amount, is_auto) VALUES (?, ?, ?, 0)
     ON CONFLICT(workspace_id, category_id) DO UPDATE SET monthly_amount = excluded.monthly_amount`
  );
  const amounts: Record<string, number> = {
    Groceries: 2_800,
    Restaurants: 900,
    "Coffee & Cafes": 300,
    Fuel: 700,
    Transport: 300,
    Shopping: 800,
    Entertainment: 500,
    Health: 350,
    "Bills & Utilities": 600,
    Arnona: 700,
    Electricity: 550,
    Water: 220,
    Subscriptions: 250,
    "Clothing & Shoes": 600,
    Furniture: 400,
    "Kids & Childcare": 2_100,
    Insurance: 450,
    "Sports & Hobbies": 350,
  };
  for (const [name, amount] of Object.entries(amounts)) {
    const id = categoryId(name);
    if (id != null) budget.run(ws, id, amount);
  }
}

/** Trackers, so the Trackers page is not empty in the demo: one per profile, like the real app. */
function seedTrackers(db: Database.Database, ws: number, today: string, categoryId: (name: string) => number | null): void {
  const ids = (names: string[]) => names.map(categoryId).filter((n): n is number => n != null);
  const trackers = [
    { id: "demo-eating-out", name: "אוכל בחוץ", categoryIds: ids(["Restaurants"]), from: addDays(today, -30), to: today, limit: 800 },
    { id: "demo-groceries", name: "סופר", categoryIds: ids(["Groceries"]), from: addDays(today, -30), to: today, limit: 3_000 },
    { id: "demo-shopping", name: "קניות וביגוד", categoryIds: ids(["Shopping", "Clothing & Shoes"]), from: addDays(today, -30), to: addDays(today, 10), limit: 1_500 },
  ].filter((t) => t.categoryIds.length > 0);
  const upsert = db.prepare(
    `INSERT INTO synced_preferences (workspace_id, profile, key, value, revision) VALUES (?, ?, 'trackers', ?, 1)
     ON CONFLICT(workspace_id, profile, key) DO NOTHING`
  );
  for (const { id } of db.prepare("SELECT id FROM profiles WHERE workspace_id = ?").all(ws) as { id: number }[]) {
    upsert.run(ws, `p${id}`, JSON.stringify(trackers));
  }
}

function seedPlanned(db: Database.Database, ws: number, today: string, categoryId: (name: string) => number | null): void {
  const planned = db.prepare(
    `INSERT INTO planned_items (workspace_id, description, amount, date, account, account_kind, installments,
       match_pattern, category_id, owner, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned')`
  );
  planned.run(ws, "חופשה משפחתית ביפן", 18_000, addDays(today, 75), DANA_CARD.account, "card", 1,
    "יפן", categoryId("Travel"), DANA, "כולל טיסות ומלונות");
  planned.run(ws, "מזגן לסלון", 6_490, addDays(today, 24), DANA_BANK.account, "bank", 1,
    "מזגן", categoryId("Home"), "shared", null);
  planned.run(ws, "מחשב נייד", 5_400, addDays(today, 40), YOAV_CARD.account, "card", 3,
    "מחשב", null, YOAV, "שלושה תשלומים");
}

function seedInsurance(db: Database.Database, ws: number): void {
  const policy = db.prepare(
    `INSERT INTO insurance_policies (workspace_id, name, kind, provider, monthly_premium, renewal_month, insured,
       policy_number, payment_account, match_pattern, start_date, end_date, coverage, deductible,
       agent_name, agent_phone, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))`
  );
  policy.run(ws, "ביטוח דירה", "home", "הפניקס", 120, "2027-03", "דנה ויואב", "HOME-88421",
    YOAV_BANK.account, "הפניקס", "2024-03-01", 1_200_000, 750, "רונית כהן", "03-5551234", "כולל צד ג' ונזקי מים");
  policy.run(ws, "ביטוח חיים", "life", "מנורה", 85, "2027-01", "דנה", "LIFE-11902",
    YOAV_BANK.account, "מנורה", "2021-01-15", 1_500_000, null, "אבי לוי", "03-5559876", null);
  policy.run(ws, "ביטוח רכב", "car", "כלל", 210, "2027-06", "יואב", "CAR-55201",
    DANA_BANK.account, "כלל", "2025-06-01", 900_000, 1_800, "דנה אזולאי", "03-5554321", "מקיף וצד ג'");
  // Two private health policies for the same person: the overlap "money on the table" points out.
  policy.run(ws, "ביטוח בריאות - הראל", "health", "הראל", 95, "2027-02", "דנה", "HLT-30117",
    YOAV_BANK.account, "הראל", "2020-02-01", null, null, null, null, null);
  policy.run(ws, "ביטוח בריאות - הפניקס", "health", "הפניקס", 70, "2027-05", "דנה", "HLT-77450",
    YOAV_BANK.account, "הפניקס בריאות", "2023-05-01", null, null, null, null, "נקנה עם הקופה");
}

function seedAssets(db: Database.Database, ws: number, today: string): void {
  const asset = db.prepare(
    `INSERT INTO assets (workspace_id, name, type, currency, manual_value, cost_basis, liquid, is_liability, note,
       fee_deposit, fee_balance, monthly_deposit, interest_rate, monthly_payment,
       city, street, rooms, size_m2, purchase_price, purchase_month)
     VALUES (?, ?, ?, 'ILS', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const snapshot = db.prepare("INSERT OR REPLACE INTO asset_snapshots (asset_id, date, value_ils) VALUES (?, ?, ?)");

  const addAsset = (a: {
    name: string; type: string; value: number; cost?: number; liquid?: boolean; liability?: boolean; note?: string | null;
    feeDeposit?: number | null; feeBalance?: number | null; monthlyDeposit?: number | null;
    interestRate?: number | null; monthlyPayment?: number | null;
    city?: string | null; street?: string | null; rooms?: number | null; sizeM2?: number | null;
    purchasePrice?: number | null; purchaseMonth?: string | null;
  }, monthlyGrowth: number) => {
    const id = Number(
      asset.run(ws, a.name, a.type, a.value, a.cost ?? null, a.liquid === false ? 0 : 1, a.liability ? 1 : 0,
        a.note ?? null, a.feeDeposit ?? null, a.feeBalance ?? null, a.monthlyDeposit ?? null,
        a.interestRate ?? null, a.monthlyPayment ?? null, a.city ?? null, a.street ?? null,
        a.rooms ?? null, a.sizeM2 ?? null, a.purchasePrice ?? null, a.purchaseMonth ?? null).lastInsertRowid
    );
    for (let k = 6; k >= 0; k--) {
      const key = monthKey(today, -k);
      const date = k === 0 ? today : monthDate(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1);
      const value = Math.round(a.value / Math.pow(1 + monthlyGrowth, k));
      snapshot.run(id, date, value);
    }
  };

  addAsset({ name: "חיסכון לחופשה", type: "deposit", value: 24_000, note: "קרן נזילה ליעד משפחתי" }, 0.002);
  addAsset({ name: "קרן השתלמות", type: "study_fund", value: 86_500, feeDeposit: 1.5, feeBalance: 1.05, monthlyDeposit: 500, liquid: false, purchaseMonth: "2021-09" }, 0.008);
  addAsset({ name: "פנסיה - מיטב", type: "pension", value: 240_000, feeDeposit: 1.8, feeBalance: 0.4, monthlyDeposit: 1_800, liquid: false }, 0.007);
  addAsset({ name: "תיק השקעות", type: "fund", value: 120_000, cost: 100_000, note: "קרנות סל עולמיות" }, 0.01);
  addAsset({
    name: "דירת מגורים", type: "real_estate", value: 2_650_000, liquid: false, city: "תל אביב", street: "הרצל 12",
    rooms: 4, sizeM2: 92, purchasePrice: 2_150_000, purchaseMonth: "2019-06",
  }, 0.004);
  addAsset({ name: "משכנתא - לאומי", type: "mortgage", value: 905_000, cost: 1_200_000, liability: true, liquid: false, interestRate: 4.6, monthlyPayment: 5_200 }, -0.0035);
  addAsset({ name: "הלוואת רכב", type: "loan", value: 42_000, cost: 90_000, liability: true, liquid: false, interestRate: 6.5, monthlyPayment: 1_350 }, -0.015);
}

function seedGoals(db: Database.Database, ws: number, today: string): void {
  const goal = db.prepare(
    "INSERT INTO goals (workspace_id, name, target_amount, target_date, saved_amount, kind, details) VALUES (?, ?, ?, ?, ?, 'general', ?)"
  );
  // A goal date is a month, not a day.
  goal.run(ws, "חופשה משפחתית ביפן", 30_000, addMonths(today, 10).slice(0, 7), 7_500,
    JSON.stringify({ icon: "✈️", color: "indigo", monthly: 1_500, dated: true }));
  goal.run(ws, "קרן חירום", 60_000, addMonths(today, 18).slice(0, 7), 24_000,
    JSON.stringify({ icon: "🛟", color: "green", monthly: 1_000, dated: true }));
}
