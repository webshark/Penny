import { describe, expect, it } from "vitest";
import { MAX_TEMPLATES, parseTemplates, upsertTemplate, type TxnTemplate } from "@/lib/transaction-templates";

const tpl = (o: Partial<TxnTemplate>): TxnTemplate => ({ id: "a", description: "שוק", kind: "expense", amount: 120, categoryId: 3, account: "cash", owner: null, ...o });

describe("transaction templates", () => {
  it("drops malformed entries", () => {
    expect(parseTemplates([tpl({}), tpl({ amount: 0 }), tpl({ description: " " }), tpl({ kind: "transfer" as never }), null])).toHaveLength(1);
    expect(parseTemplates("x")).toEqual([]);
  });
  it("replaces a template with the same description and kind, newest first, capped", () => {
    const list = upsertTemplate([tpl({ id: "old", amount: 100 }), tpl({ id: "b", description: "שכירות" })], tpl({ id: "new", amount: 150 }));
    expect(list.map((t) => t.id)).toEqual(["new", "b"]);
    const many = Array.from({ length: 20 }, (_, i) => tpl({ id: String(i), description: `d${i}` })).reduce(upsertTemplate, [] as TxnTemplate[]);
    expect(many).toHaveLength(MAX_TEMPLATES);
  });
});
