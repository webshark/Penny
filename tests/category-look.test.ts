import { beforeEach, afterEach, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock("@/server/db", () => ({ getDb: () => holder.db }));
import { runMigrations } from "@/server/db/migrate";
import { updateCategoryLook } from "@/server/db/queries/categories";

beforeEach(() => { holder.db = new Database(":memory:"); runMigrations(holder.db); });
afterEach(() => holder.db.close());

const row = (id: number) => holder.db.prepare("SELECT name, color FROM categories WHERE id = ?").get(id) as { name: string; color: string };

it("renames and recolours, refuses a name already taken, and reports a missing category", () => {
  const [a, b] = holder.db.prepare("SELECT id, name FROM categories WHERE workspace_id = 1 ORDER BY id LIMIT 2").all() as { id: number; name: string }[];
  expect(updateCategoryLook(1, a.id, { name: "Coffee", color: "#123456" })).toBe("ok");
  expect(row(a.id)).toEqual({ name: "Coffee", color: "#123456" });
  expect(updateCategoryLook(1, a.id, { color: "#abcdef" })).toBe("ok");
  expect(row(a.id).name).toBe("Coffee");
  expect(updateCategoryLook(1, b.id, { name: "coffee" })).toBe("duplicate");
  expect(row(b.id).name).toBe(b.name);
  expect(updateCategoryLook(1, 999999, { name: "X" })).toBe("not-found");
  expect(updateCategoryLook(2, a.id, { name: "Y" })).toBe("not-found");
});
