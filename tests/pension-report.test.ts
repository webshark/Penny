import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock("@/server/db", () => ({ getDb: () => holder.db }));

import { runMigrations } from "@/server/db/migrate";
import { importPensionReport, listPensionReports } from "@/server/pension/report";
import {
  isReportDate,
  parsePensionReport,
  reportAssetKey,
  reportAssetName,
  reportAssetType,
  reportDetails,
} from "@/lib/pension-report";

const example = () => JSON.parse(readFileSync("public/pension-report.example.json", "utf8")) as Draft;
interface Draft {
  asOf: string;
  summary: Record<string, unknown>;
  products: Record<string, unknown>[];
  insurance: Record<string, unknown>[];
}
const edit = (change: (report: Draft) => void) => {
  const report = example();
  change(report);
  return report;
};
const parsed = () => {
  const report = parsePensionReport(example());
  if (typeof report === "string") throw new Error(report);
  return report;
};

describe("pension report parsing", () => {
  it("reads the example report: products, fees, tracks and insurance", () => {
    const report = parsed();
    expect(report.asOf).toBe("2026-06-30");
    expect(report.totalSavings).toBe(412000);
    expect(report.products).toHaveLength(2);
    expect(report.insurance).toHaveLength(1);

    const pension = report.products[0];
    expect(pension).toMatchObject({
      type: "pension",
      name: "מגדל מקפת אישית",
      provider: "מגדל",
      policyNumber: "000111222",
      balance: 310000,
      feeDeposit: 1.5,
      feeBalance: 0.15,
      status: "active",
      regularDeposit: 2900,
      expectedAnnuity: 2100,
    });
    expect(pension.tracks[0].returns).toHaveLength(7);
    expect(pension.components).toEqual({ pitzuyim: 98000, tagmulim: 212000, capital: 0 });

    expect(report.insurance[0]).toMatchObject({ kind: "life", provider: "הראל", premium: 85, coverage: 1000000 });
  });

  it("maps a product to an asset: type, name with the number's tail, and the marker in the note", () => {
    const [pension, study] = parsed().products;
    expect(reportAssetType(pension)).toBe("pension");
    expect(reportAssetType(study)).toBe("study_fund");
    expect(reportAssetName(pension)).toBe('מגדל מקפת אישית — חברת אלפא בע"מ ···1222');
    expect(reportAssetKey(pension)).toBe('pension-report:מגדל:000111222:pension:מגדל מקפת אישית');
    expect(reportDetails(pension, "2026-06-30")).toMatchObject({ reportAsOf: "2026-06-30", expectedAnnuity: 2100, status: "active" });
  });

  it("refuses a report whose products do not add up to its own total", () => {
    const err = parsePensionReport(edit((r) => { r.summary.totalSavings = 500000; }));
    expect(err).toContain("add up to 412000");
  });

  it("requires a real date, a total and the product essentials", () => {
    expect(parsePensionReport(edit((r) => { r.asOf = "2026-02-30"; }))).toContain("asOf");
    expect(parsePensionReport(edit((r) => { delete r.summary.totalSavings; }))).toContain("totalSavings");
    expect(parsePensionReport(edit((r) => { delete r.products[0].balance; }))).toContain("balance");
    expect(parsePensionReport(edit((r) => { r.products[0].type = "bitcoin"; }))).toContain("type must be");
    expect(parsePensionReport(edit((r) => { r.products[0].feeBalance = 40; }))).toContain("feeBalance");
    expect(parsePensionReport([])).toContain("JSON object");
  });

  it("rejects two products that would land on the same asset", () => {
    const err = parsePensionReport(edit((r) => { r.products[1] = { ...r.products[0], balance: 0 }; r.summary.totalSavings = 310000; }));
    expect(typeof err).toBe("string");
    if (typeof err === "string") expect(err).toContain("two products");
  });

  it("turns a yearly or quarterly premium into a monthly one, and an unknown kind into other", () => {
    const yearly = parsePensionReport(edit((r) => {
      r.insurance[0].premium = 1200;
      r.insurance[0].premiumFrequency = "yearly";
      r.insurance[0].type = "weird";
    }));
    expect(typeof yearly).not.toBe("string");
    if (typeof yearly !== "string") expect(yearly.insurance[0]).toMatchObject({ premium: 100, kind: "other" });

    const quarterly = parsePensionReport(edit((r) => { r.insurance[0].premium = 300; r.insurance[0].premiumFrequency = "quarterly"; }));
    if (typeof quarterly !== "string") expect(quarterly.insurance[0].premium).toBe(100);
    else throw new Error(quarterly);
  });

  it("knows a calendar day from a date-shaped string", () => {
    expect(isReportDate("2026-06-30")).toBe(true);
    expect(isReportDate("2026-02-30")).toBe(false);
    expect(isReportDate("30/06/2026")).toBe(false);
  });
});

describe("pension report import", () => {
  beforeEach(() => {
    holder.db = new Database(":memory:");
    runMigrations(holder.db);
    holder.db.pragma("foreign_keys = ON");
  });
  afterEach(() => holder.db.close());

  const count = (sql: string, ...args: unknown[]) => (holder.db.prepare(sql).get(...args) as { n: number }).n;

  it("writes products as assets with a snapshot on the report date, and the insurance as a policy", () => {
    const result = importPensionReport(1, parsed());
    expect(result).toMatchObject({ products: 2, created: 2, updated: 0, policies: 1, policiesCreated: 1 });
    expect(count("SELECT COUNT(*) AS n FROM assets")).toBe(2);
    expect(count("SELECT COUNT(*) AS n FROM asset_snapshots WHERE date = '2026-06-30'")).toBe(2);

    const asset = holder.db.prepare("SELECT name, type, manual_value AS value, fee_balance AS fee, monthly_deposit AS deposit, liquid, note FROM assets WHERE type = 'pension'").get() as Record<string, unknown>;
    expect(asset).toMatchObject({ type: "pension", value: 310000, fee: 0.15, deposit: 2900, liquid: 0 });
    expect(String(asset.note)).toContain("pension-report:מגדל:000111222");

    const policy = holder.db.prepare("SELECT kind, provider, monthly_premium AS premium, policy_number AS number, coverage, insured, notes FROM insurance_policies").get() as Record<string, unknown>;
    expect(policy).toMatchObject({ kind: "life", provider: "הראל", premium: 85, number: "000555666", coverage: 1000000, insured: "בן/בת זוג 1" });

    expect(listPensionReports(1)).toMatchObject([{ asOf: "2026-06-30", totalSavings: 412000, products: 2 }]);
  });

  it("updates on a second import instead of duplicating, keeping what the user changed", () => {
    importPensionReport(1, parsed());
    holder.db.prepare("UPDATE assets SET name = 'הפנסיה שלי' WHERE type = 'pension'").run();
    holder.db.prepare("UPDATE insurance_policies SET notes = 'הערה שלי', match_pattern = 'מנורה'").run();

    const next = edit((r) => {
      r.products[0].balance = 320000;
      r.summary.totalSavings = 422000;
      r.insurance[0].name = "ביטוח חיים ריסק";
      r.insurance[0].notes = "נוסח חדש";
    });
    const report = parsePensionReport(next);
    if (typeof report === "string") throw new Error(report);
    const result = importPensionReport(1, report);

    expect(result).toMatchObject({ created: 0, updated: 2, policies: 1, policiesCreated: 0 });
    expect(count("SELECT COUNT(*) AS n FROM assets")).toBe(2);
    expect(count("SELECT COUNT(*) AS n FROM asset_snapshots")).toBe(2);
    expect(count("SELECT COUNT(*) AS n FROM insurance_policies")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM pension_reports")).toBe(1);

    const asset = holder.db.prepare("SELECT name, manual_value AS value FROM assets WHERE type = 'pension'").get() as { name: string; value: number };
    expect(asset).toEqual({ name: "הפנסיה שלי", value: 320000 });
    const policy = holder.db.prepare("SELECT notes, match_pattern AS match FROM insurance_policies").get() as { notes: string; match: string };
    expect(policy).toEqual({ notes: "הערה שלי", match: "מנורה" });
  });

  it("keeps a product's deposit out when the report marks it inactive", () => {
    const report = parsePensionReport(edit((r) => { r.products[1].status = "inactive"; r.products[1].regularDeposit = 1500; }));
    if (typeof report === "string") throw new Error(report);
    importPensionReport(1, report);
    const study = holder.db.prepare("SELECT monthly_deposit AS deposit FROM assets WHERE type = 'study_fund'").get() as { deposit: number | null };
    expect(study.deposit).toBeNull();
  });
});
