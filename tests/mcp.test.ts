import { describe, expect, it } from "vitest";
import {
  callApi,
  formatBudgets,
  formatNetWorth,
  formatOverview,
  formatTransactions,
  formatUpcoming,
  handleMessage,
  TOOLS,
} from "../scripts/mcp.mjs";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: { type: string };
}

/** The reply shape these tests look at. A message with an id always gets one. */
interface RpcReply {
  result?: {
    protocolVersion?: string;
    capabilities?: unknown;
    serverInfo?: { name: string; version: string };
    tools?: ToolDescriptor[];
    content?: { type: string; text: string }[];
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

const rpc = (reply: unknown) => reply as RpcReply | null;

describe("MCP tool formatting", () => {
  it("sums up a period with each category's share of the spending", () => {
    const text = formatOverview({
      period: { from: "2026-11-01", to: "2026-11-30" },
      totals: { income: 20000, expenses: 8000, net: 12000, savingsRate: 0.6 },
      byCost: { fixed: 5000, variable: 2500, unplanned: 500 },
      uncategorized: 250,
      categories: [
        { name: "Food", spent: 6000, previous: 5000 },
        { name: "Transport", spent: 2000, previous: 0 },
        { name: "Unused", spent: 0, previous: 0 },
      ],
    });
    expect(text).toContain("Income: ₪20,000");
    expect(text).toContain("Net: ₪12,000 (savings rate 60%)");
    expect(text).toContain("fixed ₪5,000");
    expect(text).toContain("Still uncategorized: ₪250");
    expect(text).toContain("- Food: ₪6,000 (75% of spending) · previous period ₪5,000");
    expect(text).toContain("- Transport: ₪2,000 (25% of spending)");
    expect(text).not.toContain("Unused");
  });

  it("prints transactions with their sign, category and account, and says when it cut the list", () => {
    const text = formatTransactions({
      total: 40,
      transactions: [
        { date: "2026-11-03", chargedAmount: -42.5, description: "Supermarket", categoryName: "Food", accountLabel: "Visa 1234", kind: "expense" },
        { date: "2026-11-01", chargedAmount: 9000, description: "Salary", categoryName: null, provider: "hapoalim", kind: "income" },
      ],
    });
    expect(text).toContain("2026-11-03  −₪43  Supermarket  [Food · Visa 1234 · expense]");
    expect(text).toContain("uncategorized · hapoalim · income");
    expect(text).toContain("Showing 2 of 40");
    expect(formatTransactions({ transactions: [], total: 0 })).toBe("No transactions match that filter.");
  });

  it("lists only the categories that have a budget, with what is left", () => {
    const text = formatBudgets({
      periodTotal: 3000,
      totalBudget: 7000,
      uncategorized: 120,
      categoriesWithData: [
        { categoryName: "Food", spent: 1200, budget: 2000, remaining: 800, percentSpent: 60, isParent: false },
        { categoryName: "Tracking only", spent: 500, budget: 0, remaining: 0, isParent: false },
        { categoryName: "Parent rollup", spent: 900, budget: 900, remaining: 0, isParent: true },
      ],
    });
    expect(text).toContain("Spent so far in this household month: ₪3,000 of a ₪7,000 target");
    expect(text).toContain("- Food: spent ₪1,200 of ₪2,000 (60% used, ₪800 left)");
    expect(text).not.toContain("Tracking only");
    expect(text).not.toContain("Parent rollup");
  });

  it("reports net worth and its largest holdings", () => {
    const text = formatNetWorth({
      totals: { assets: 500000, liquid: 120000, liabilities: 200000, deferredTax: 1500, netWorth: 298500, liquidNetWorth: 100000 },
      assets: [
        { name: "Apartment", type: "real_estate", valueIls: 400000, liquid: false },
        { name: "Brokerage", type: "stock", valueIls: 90000, liquid: true },
      ],
    });
    expect(text).toContain("Net worth: ₪298,500");
    expect(text).toContain("Assets: ₪500,000 (liquid ₪120,000) · Liabilities: ₪200,000");
    expect(text).toContain("Deferred tax on unrealised gains: ₪1,500");
    expect(text.indexOf("Apartment")).toBeLessThan(text.indexOf("Brokerage"));
  });

  it("sorts the upcoming payments and flags the overdue ones", () => {
    const text = formatUpcoming({
      totals: { planned: 9000, matched: 0, overdue: 1500, upcoming: 7500 },
      items: [
        { status: "planned", description: "Laptop", overdue: true, nextPayment: { date: "2026-11-01", chargeDate: "2026-11-10", amount: 1500 } },
        { status: "planned", description: "Flight", overdue: false, nextPayment: { date: "2026-12-01", chargeDate: "2026-12-10", amount: 7500 } },
        { status: "matched", description: "Already bought", overdue: false, nextPayment: { date: "2026-11-20", chargeDate: "2026-11-20", amount: 300 } },
      ],
    });
    expect(text).toContain("Planned purchases: ₪9,000 · still upcoming ₪7,500 · overdue ₪1,500");
    expect(text.indexOf("Laptop")).toBeLessThan(text.indexOf("Flight"));
    expect(text).toContain("2026-11-10  Laptop  ₪1,500 · overdue");
    expect(text).not.toContain("Already bought");
  });
});

describe("MCP protocol", () => {
  it("answers initialize in the client's protocol version and never claims write access", async () => {
    const reply = rpc(
      await handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05" },
      })
    );
    expect(reply?.result?.protocolVersion).toBe("2024-11-05");
    expect(reply?.result?.serverInfo?.name).toBe("penny");
    expect(reply?.result?.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("falls back to its own protocol version for one it does not know", async () => {
    const reply = rpc(
      await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } })
    );
    expect(reply?.result?.protocolVersion).toBe("2025-06-18");
  });

  it("lists every read tool with a JSON schema", async () => {
    const reply = rpc(await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const tools = reply?.result?.tools ?? [];
    expect(tools).toHaveLength(TOOLS.length);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("stays silent on notifications", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/cancelled", params: {} })).toBeNull();
  });

  it("rejects an unknown tool and an unknown method", async () => {
    const unknownTool = rpc(
      await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "delete_everything" } })
    );
    expect(unknownTool?.error?.code).toBe(-32602);
    const unknownMethod = rpc(await handleMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" }));
    expect(unknownMethod?.error?.code).toBe(-32601);
  });

  it("asks the running app and returns its answer as text", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        periodTotal: 10,
        totalBudget: 0,
        uncategorized: 0,
        categoriesWithData: [],
      });
    const reply = rpc(
      await handleMessage(
        { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "penny_budgets", arguments: {} } },
        { baseUrl: "http://127.0.0.1:41234", fetchImpl }
      )
    );
    expect(reply?.result?.isError).toBe(false);
    expect(reply?.result?.content?.[0]?.text).toContain("Spent so far in this household month: ₪10");
  });

  it("turns an app failure into a readable tool error instead of a crash", async () => {
    const reply = rpc(
      await handleMessage(
        { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "penny_net_worth", arguments: {} } },
        {
          baseUrl: "http://127.0.0.1:41234",
          fetchImpl: async () => jsonResponse({ error: "locked" }, 401),
        }
      )
    );
    expect(reply?.result?.isError).toBe(true);
    expect(reply?.result?.content?.[0]?.text).toContain("locked");
  });

  it("explains an app that is not running at all", async () => {
    await expect(
      callApi("/api/assets", {
        baseUrl: "http://127.0.0.1:41234",
        fetchImpl: async () => {
          throw new Error("ECONNREFUSED");
        },
      })
    ).rejects.toThrow(/Penny is not answering at http:\/\/127\.0\.0\.1:41234/);
  });

  it("sends the workspace header only when one was chosen", async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = async (_url: string, init?: { headers?: Record<string, string> }) => {
      seen.push(init?.headers?.["x-workspace-id"] ?? null);
      return jsonResponse({});
    };
    await callApi("/api/assets", { baseUrl: "http://127.0.0.1:41234", fetchImpl });
    await callApi("/api/assets", { baseUrl: "http://127.0.0.1:41234", fetchImpl, workspaceId: 3 });
    expect(seen).toEqual([null, "3"]);
  });
});
