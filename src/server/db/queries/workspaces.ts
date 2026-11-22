import "server-only";

import { ApiError } from "@/server/lib/api-error";
import { applyCategoryHierarchy } from "../category-hierarchy";
import { applyFamilyColors } from "../category-colors";

import { getDb } from "../index";
import type { Workspace } from "@/lib/types";
import type { AvatarInput } from "@/lib/profile-avatar";

interface WorkspaceRow {
  id: number;
  name: string;
  slug: string;
  avatar_emoji: string | null;
  avatar_color: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    avatarEmoji: row.avatar_emoji,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listWorkspaces(): Workspace[] {
  const rows = getDb()
    .prepare(
      "SELECT id, name, slug, avatar_emoji, avatar_color, created_at, updated_at FROM workspaces ORDER BY id"
    )
    .all() as WorkspaceRow[];
  return rows.map(mapRow);
}

export function getWorkspace(id: number): Workspace | null {
  const row = getDb()
    .prepare(
      "SELECT id, name, slug, avatar_emoji, avatar_color, created_at, updated_at FROM workspaces WHERE id = ?"
    )
    .get(id) as WorkspaceRow | undefined;
  return row ? mapRow(row) : null;
}

export function countWorkspaces(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM workspaces")
    .get() as { count: number };
  return row.count;
}

// Cumulative seed list reflecting migrations 001 + 006 (removed "Other")
// + 008 (added "Salary", kind column) + 010 (brighter colors)
// + 011 (added 7 more) + 014 (Sports & Hobbies + descriptions). Keep in sync.
interface SeedCategory {
  name: string;
  color: string;
  icon: string;
  kind: "expense" | "income";
  description: string;
  needType?: "need" | "want" | "saving";
  costType?: "fixed" | "variable" | "unplanned";
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: "Groceries", color: "#81B482", icon: "shopping-basket", kind: "expense", description: "Supermarkets, grocery stores, food markets (Shufersal, Rami Levy, Yochananof, Victory, Tiv Taam, Mahane Yehuda vendors). NOT restaurants or prepared meals." },
  { name: "Restaurants", color: "#E89B80", icon: "utensils-crossed", kind: "expense", description: "Sit-down restaurants, takeout, food delivery (Wolt, 10bis when itemized as restaurants), bars and pubs. NOT cafes for daily coffee (Coffee & Cafes) and NOT groceries." },
  { name: "Transport", color: "#65AFD2", icon: "tram-front", kind: "expense", description: "Public transport (Rav-Kav, Israel Railways), taxis (Gett, Yango), ride-share, fuel stations, parking, car washes, tolls. NOT car insurance (Insurance) and NOT travel airfare (Travel)." },
  { name: "Shopping", color: "#DCB87A", icon: "shopping-bag", kind: "expense", description: "General retail, clothing, electronics, household goods (Zara, H&M, IKEA, KSP, Castro). NOT groceries and NOT hobby-specific shops (Sports & Hobbies)." },
  { name: "Entertainment", color: "#E499A4", icon: "ticket", kind: "expense", description: "Cinemas, concerts, theater, museums, streaming events, gaming purchases, amusement parks. NOT subscription services (Subscriptions) and NOT sports/hobby activities (Sports & Hobbies)." },
  { name: "Health", color: "#75BCA3", icon: "heart-pulse", kind: "expense", description: "Pharmacies, doctors, dentists, clinics, lab tests, medical equipment, optical (Super-Pharm, Be Pharm, Clalit, Maccabi private clinics). NOT health insurance premiums (Insurance) and NOT gym memberships (Sports & Hobbies)." },
  { name: "Education", color: "#94A0DD", icon: "graduation-cap", kind: "expense", description: "Schools, universities, tuition, online courses (Coursera, Udemy, MasterClass), textbooks, school supplies, exam fees. NOT shooting ranges, gun training, or martial-arts classes (Sports & Hobbies) and NOT music lessons for fun (Sports & Hobbies)." },
  { name: "Bills & Utilities", color: "#B8A98F", icon: "receipt", kind: "expense", description: "Electricity, water, gas, internet, phone bills, municipal arnona, building vaad bayit. NOT streaming or software subscriptions (Subscriptions)." },
  { name: "Subscriptions", color: "#AB9DDB", icon: "refresh-cw", kind: "expense", description: "Recurring digital services: Netflix, Spotify, YouTube Premium, iCloud, Google One, SaaS tools, news subscriptions. NOT physical utility bills (Bills & Utilities)." },
  { name: "Travel", color: "#64B8D2", icon: "plane", kind: "expense", description: "Flights, hotels, Airbnb, vacation rentals, travel agencies, foreign-currency lodging, car rentals abroad. NOT daily transport (Transport)." },
  { name: "Cash & ATM", color: "#DBC27F", icon: "banknote", kind: "expense", description: "ATM withdrawals, cash advances, currency exchange. Often labeled bankomat / כספומט." },
  { name: "Transfers", color: "#A2AAC2", icon: "arrow-left-right", kind: "expense", description: "Bank-to-bank transfers, Bit/PayBox to people, internal moves." },
  { name: "Insurance", color: "#E59A99", icon: "shield", kind: "expense", description: "Car, home, health, life insurance premiums, leumit/menora/clal/migdal insurance lines. NOT medical visit copays (Health)." },
  { name: "Home", color: "#D3A96F", icon: "home", kind: "expense", description: "Furniture, appliances, repairs, hardware, gardening, home services (cleaners, handymen). NOT rent and NOT utilities." },
  { name: "Personal Care", color: "#D5A4D7", icon: "sparkles", kind: "expense", description: "Hair salons, barbershops, beauty, nails, spa, cosmetics (Sephora). NOT gyms (Sports & Hobbies)." },
  { name: "Coffee & Cafes", color: "#A57B5B", icon: "coffee", kind: "expense", description: "Coffee shops, cafes, bakeries, daily coffee runs (Aroma, Cafelix, Greg, Cofix). NOT restaurants." },
  { name: "Pet Care", color: "#6EBFB5", icon: "paw-print", kind: "expense", description: "Vet, pet food, pet supplies, pet grooming, pet boarding. NOT general food shopping." },
  { name: "Gifts & Donations", color: "#D67BAA", icon: "gift", kind: "expense", description: "Charitable donations, gift purchases for others, tithing, fundraising contributions." },
  { name: "Kids & Childcare", color: "#E5D080", icon: "baby", kind: "expense", description: "Daycare, babysitters, after-school programs, kids' clothing/toys when clearly child-specific." },
  { name: "Sports & Hobbies", color: "#7BB36B", icon: "dumbbell", kind: "expense", description: "Gyms, sports clubs, fitness studios, shooting ranges (מטווח/מטווחי), martial arts, climbing walls, hobby shops, craft supplies, musical instrument lessons, sports gear. NOT general entertainment." },
  { name: "Salary", color: "#85B59A", icon: "briefcase", kind: "income", description: "Regular wage payments from employer (משכורת, שכר)." },
  { name: "Freelance & Side Income", color: "#C0D582", icon: "briefcase", kind: "income", description: "Invoices paid by clients, side-gig deposits, consulting fees." },
  { name: "Investment Income", color: "#7B85C9", icon: "trending-up", kind: "income", description: "Dividends, interest, stock sale proceeds, crypto sale proceeds." },
  { name: "Refunds & Reimbursements", color: "#7DC8B3", icon: "rotate-ccw", kind: "income", description: "Returns, expense reimbursements, insurance payouts, refunds from cancellations." },
  // 045_israeli_categories.sql
  { name: "Arnona", color: "#B8A98F", icon: "landmark", kind: "expense", needType: "need", costType: "fixed", description: "Municipal property tax (ארנונה, עירייה)." },
  { name: "Building Committee", color: "#C2B59B", icon: "building", kind: "expense", needType: "need", costType: "fixed", description: "Vaad bayit, building maintenance fees." },
  { name: "Electricity", color: "#E5C35C", icon: "zap", kind: "expense", needType: "need", costType: "fixed", description: "Electricity bills (חברת החשמל, Electra Power, Cellcom Energy)." },
  { name: "Water", color: "#65AFD2", icon: "droplet", kind: "expense", needType: "need", costType: "fixed", description: "Water bills (תאגיד מים, מי אביבים, הגיחון)." },
  { name: "Gas", color: "#E7A875", icon: "flame", kind: "expense", needType: "need", costType: "fixed", description: "Cooking/heating gas (סופרגז, אמישראגז, פזגז)." },
  { name: "Internet & TV", color: "#9186D1", icon: "wifi", kind: "expense", needType: "need", costType: "fixed", description: "Home internet and TV (בזק, HOT, yes, פרטנר TV, סלקום TV)." },
  { name: "Mobile Phone", color: "#7D90CA", icon: "smartphone", kind: "expense", needType: "need", costType: "fixed", description: "Mobile plans (פרטנר, סלקום, פלאפון, גולן טלקום, הוט מובייל)." },
  { name: "Mortgage", color: "#D3A96F", icon: "home", kind: "expense", needType: "need", costType: "fixed", description: "Monthly mortgage payments." },
  { name: "Renovations", color: "#BFB89B", icon: "hammer", kind: "expense", needType: "want", costType: "unplanned", description: "Renovations, contractors, building materials (ACE, הום סנטר)." },
  { name: "Furniture", color: "#D6C480", icon: "sofa", kind: "expense", needType: "want", costType: "unplanned", description: "Furniture and big home items (IKEA, ACE, עצמלה)." },
  { name: "Car Insurance", color: "#E59A99", icon: "shield", kind: "expense", needType: "need", costType: "fixed", description: "Car insurance premiums (חובה, מקיף, צד ג)." },
  { name: "Health Insurance", color: "#E58F8E", icon: "shield", kind: "expense", needType: "need", costType: "fixed", description: "Private health insurance premiums." },
  { name: "Life Insurance", color: "#D98A89", icon: "shield", kind: "expense", needType: "need", costType: "fixed", description: "Life and mortgage life insurance premiums." },
  { name: "Health Fund", color: "#75BCA3", icon: "heart-pulse", kind: "expense", needType: "need", costType: "fixed", description: "Kupat holim supplementary plans (כללית, מכבי, מאוחדת, לאומית)." },
  { name: "Medications", color: "#73C4A8", icon: "pill", kind: "expense", needType: "need", costType: "variable", description: "Pharmacy medicines (סופר-פארם, בי פארם)." },
  { name: "Dentist", color: "#92D5B7", icon: "stethoscope", kind: "expense", needType: "need", costType: "unplanned", description: "Dental care and orthodontics." },
  { name: "Daycare & After-school", color: "#E5D080", icon: "baby", kind: "expense", needType: "need", costType: "fixed", description: "Gan, daycare, tzaharon fees." },
  { name: "Kids Activities", color: "#D6C480", icon: "ticket", kind: "expense", needType: "want", costType: "fixed", description: "After-school classes and activities (חוגים)." },
  { name: "Tuition", color: "#94A0DD", icon: "graduation-cap", kind: "expense", needType: "need", costType: "fixed", description: "School and university tuition." },
  { name: "Fuel", color: "#65C1D1", icon: "fuel", kind: "expense", needType: "need", costType: "variable", description: "Fuel stations (פז, דלק, סונול, Ten, דור אלון)." },
  { name: "Parking", color: "#7D90CA", icon: "car", kind: "expense", needType: "need", costType: "variable", description: "Parking (פנגו, סלופארק, אחוזות החוף)." },
  { name: "Public Transport", color: "#65AFD2", icon: "tram-front", kind: "expense", needType: "need", costType: "variable", description: "Rav-Kav, buses, trains, light rail." },
  { name: "Car Test & License", color: "#A2ABBB", icon: "car", kind: "expense", needType: "need", costType: "unplanned", description: "Annual car test and vehicle license fee." },
  { name: "Food Delivery", color: "#E89B80", icon: "bike", kind: "expense", needType: "want", costType: "variable", description: "Food delivery apps (Wolt, תן ביס, משלוחה)." },
  { name: "Clothing & Shoes", color: "#DCB87A", icon: "shirt", kind: "expense", needType: "want", costType: "variable", description: "Clothes and shoes (קסטרו, פוקס, H&M, זארה)." },
  { name: "Cosmetics", color: "#D5A4D7", icon: "sparkles", kind: "expense", needType: "want", costType: "variable", description: "Cosmetics and toiletries." },
  { name: "Books", color: "#BF9ED9", icon: "book-open", kind: "expense", needType: "want", costType: "variable", description: "Books (סטימצקי, צומת ספרים)." },
  { name: "Gifts & Events", color: "#D692BF", icon: "gift", kind: "expense", needType: "want", costType: "unplanned", description: "Gifts and event checks (weddings, bar mitzvahs)." },
  { name: "Donations", color: "#D67BAA", icon: "gift", kind: "expense", needType: "want", costType: "variable", description: "Charity and donations." },
  { name: "Bank Fees", color: "#A2AAC2", icon: "percent", kind: "expense", needType: "need", costType: "variable", description: "Bank and card fees (עמלה, דמי כרטיס)." },
  { name: "Interest", color: "#A2ABBB", icon: "percent", kind: "expense", needType: "need", costType: "variable", description: "Interest charges on overdraft and credit." },
  { name: "Income Tax", color: "#7D90CA", icon: "landmark", kind: "expense", needType: "need", costType: "unplanned", description: "Income tax payments." },
  { name: "National Insurance", color: "#65AFD2", icon: "landmark", kind: "expense", needType: "need", costType: "fixed", description: "Bituach Leumi payments." },
  { name: "Loans", color: "#A2AAC2", icon: "banknote", kind: "expense", needType: "need", costType: "fixed", description: "Loan repayments." },
  { name: "Savings", color: "#81B482", icon: "piggy-bank", kind: "expense", needType: "saving", costType: "fixed", description: "Money moved to savings, kupat gemel, keren hishtalmut." },
  { name: "Investments", color: "#7B85C9", icon: "trending-up", kind: "expense", needType: "saving", costType: "variable", description: "Money moved to investments." },
  { name: "Benefits & Allowances", color: "#85B59A", icon: "landmark", kind: "income", needType: "want", costType: "variable", description: "Bituach Leumi allowances (קצבת ילדים, אבטלה, נכות)." },
  { name: "Tax Refunds", color: "#7DC8B3", icon: "rotate-ccw", kind: "income", needType: "want", costType: "variable", description: "Income tax refunds." },
  { name: "Gifts Received", color: "#D692BF", icon: "gift", kind: "income", needType: "want", costType: "variable", description: "Money received as a gift." },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";
}

function uniqueSlug(base: string): string {
  const db = getDb();
  let candidate = base;
  let n = 2;
  while (
    (db
      .prepare("SELECT 1 FROM workspaces WHERE slug = ?")
      .get(candidate) as { 1: number } | undefined)
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

function setAvatar(id: number, avatar: AvatarInput): void {
  const db = getDb();
  if (avatar.avatarEmoji !== undefined)
    db.prepare("UPDATE workspaces SET avatar_emoji = ? WHERE id = ?").run(avatar.avatarEmoji, id);
  if (avatar.avatarColor !== undefined)
    db.prepare("UPDATE workspaces SET avatar_color = ? WHERE id = ?").run(avatar.avatarColor, id);
}

export function createWorkspace(name: string, avatar: AvatarInput = {}): Workspace {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError("Workspace name is required", 400);
  if (trimmed.length > 60) throw new ApiError("Workspace name too long", 400);

  const db = getDb();
  const slug = uniqueSlug(slugify(trimmed));

  const create = db.transaction(() => {
    const result = db
      .prepare(
        "INSERT INTO workspaces (name, slug) VALUES (?, ?)"
      )
      .run(trimmed, slug);
    const id = Number(result.lastInsertRowid);

    const insertCat = db.prepare(
      "INSERT INTO categories (workspace_id, name, color, icon, kind, description, need_type, cost_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const c of SEED_CATEGORIES) {
      insertCat.run(id, c.name, c.color, c.icon, c.kind, c.description, c.needType ?? "want", c.costType ?? "variable");
    }
    applyCategoryHierarchy(db, id);
    applyFamilyColors(db, id);
    setAvatar(id, avatar);
    return id;
  });

  const id = create();
  const row = getWorkspace(id);
  if (!row) throw new ApiError("Workspace creation failed", 500);
  return row;
}

export function updateWorkspace(id: number, name: string, avatar: AvatarInput = {}): Workspace {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError("Workspace name is required", 400);
  if (trimmed.length > 60) throw new ApiError("Workspace name too long", 400);

  const db = getDb();
  const existing = getWorkspace(id);
  if (!existing) throw new ApiError("Workspace not found", 404);

  let slug = existing.slug;
  if (trimmed.toLowerCase() !== existing.name.toLowerCase()) {
    slug = uniqueSlug(slugify(trimmed));
  }

  db.prepare(
    "UPDATE workspaces SET name = ?, slug = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(trimmed, slug, id);
  setAvatar(id, avatar);

  const updated = getWorkspace(id);
  if (!updated) throw new ApiError("Workspace update failed", 500);
  return updated;
}

export function deleteWorkspace(id: number): void {
  if (countWorkspaces() <= 1) {
    throw new ApiError("Cannot delete the only workspace", 409, "last-workspace");
  }
  getDb().prepare("DELETE FROM workspaces WHERE id = ?").run(id);
}
