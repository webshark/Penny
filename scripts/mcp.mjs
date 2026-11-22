#!/usr/bin/env node
/**
 * Penny's MCP server over stdio.
 *
 * Read-only by design: every tool asks the running app over its local HTTP API,
 * so this process never opens the database, never writes anything and never
 * listens on a port. Set PENNY_BASE_URL when the app runs somewhere other than
 * the default 127.0.0.1:41234, and PENNY_WORKSPACE_ID to read a specific
 * household workspace.
 */
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:41234";
const SERVER_NAME = "penny";
const SERVER_VERSION = "0.2.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const KNOWN_PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

/** An error the model should read as an explanation, not as a crash. */
export class PennyError extends Error {}

const ils = (value) =>
  `${Number(value) < 0 ? "−" : ""}₪${Math.round(Math.abs(Number(value) || 0)).toLocaleString("en-US")}`;

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/** Whole number inside [min, max], or the fallback for anything that isn't one. */
function intArg(value, fallback, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function textArg(value, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function dateArg(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

/** Money out of a row that may carry either the charged or the original amount. */
const rowAmount = (row) => Number(row?.chargedAmount ?? row?.originalAmount ?? 0);

export function formatOverview(payload) {
  const totals = payload?.totals ?? {};
  const lines = [
    `Period: ${payload?.period?.from ?? "?"} to ${payload?.period?.to ?? "?"}`,
    `Income: ${ils(totals.income)}`,
    `Spending: ${ils(totals.expenses)}`,
    `Net: ${ils(totals.net)}${totals.savingsRate != null ? ` (savings rate ${Math.round(totals.savingsRate * 100)}%)` : ""}`,
  ];
  const byCost = payload?.byCost ?? {};
  lines.push(
    `Spending by type: fixed ${ils(byCost.fixed)} · variable ${ils(byCost.variable)} · unplanned ${ils(byCost.unplanned)}`
  );
  if (payload?.uncategorized > 0) lines.push(`Still uncategorized: ${ils(payload.uncategorized)}`);

  const categories = (payload?.categories ?? [])
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const total = categories.reduce((sum, c) => sum + c.spent, 0);
  if (categories.length > 0) {
    lines.push("", "By category:");
    for (const c of categories.slice(0, 12)) {
      const previous = c.previous > 0 ? ` · previous period ${ils(c.previous)}` : "";
      lines.push(`- ${c.name}: ${ils(c.spent)} (${pct(c.spent, total)} of spending)${previous}`);
    }
    if (categories.length > 12) lines.push(`- and ${categories.length - 12} more categories`);
  }
  return lines.join("\n");
}

export function formatTransactions(result) {
  const rows = result?.transactions ?? [];
  if (rows.length === 0) return "No transactions match that filter.";
  const lines = rows.map((t) => {
    const category = t.categoryName ?? "uncategorized";
    const account = t.accountLabel ?? t.provider ?? "account";
    return `${t.date}  ${ils(rowAmount(t))}  ${t.description ?? ""}  [${category} · ${account} · ${t.kind}]`;
  });
  const total = Number(result?.total ?? rows.length);
  if (total > rows.length) lines.push(`Showing ${rows.length} of ${total}. Narrow the dates or the search to see the rest.`);
  return lines.join("\n");
}

export function formatBudgets(summary) {
  const rows = (summary?.categoriesWithData ?? [])
    .filter((r) => r && r.isParent !== true && Number(r.budget) > 0)
    .sort((a, b) => b.spent - a.spent);
  const lines = [
    `Spent so far in this household month: ${ils(summary?.periodTotal)}${Number(summary?.totalBudget) > 0 ? ` of a ${ils(summary.totalBudget)} target` : ""}`,
  ];
  if (Number(summary?.uncategorized) > 0) lines.push(`Still uncategorized: ${ils(summary.uncategorized)}`);
  if (rows.length === 0) {
    lines.push("", "No category has a budget set yet.");
    return lines.join("\n");
  }
  lines.push("", "Category budgets:");
  for (const r of rows) {
    lines.push(
      `- ${r.categoryName}: spent ${ils(r.spent)} of ${ils(r.budget)} (${pct(r.spent, r.budget)} used, ${ils(r.remaining)} left)`
    );
  }
  return lines.join("\n");
}

export function formatNetWorth(payload) {
  const totals = payload?.totals ?? {};
  const lines = [
    `Net worth: ${ils(totals.netWorth)}`,
    `Assets: ${ils(totals.assets)} (liquid ${ils(totals.liquid)}) · Liabilities: ${ils(totals.liabilities)}`,
  ];
  if (Number(totals.deferredTax) > 0) lines.push(`Deferred tax on unrealised gains: ${ils(totals.deferredTax)}`);
  const assets = (payload?.assets ?? [])
    .filter((a) => Number(a?.valueIls) > 0)
    .sort((a, b) => Number(b.valueIls) - Number(a.valueIls));
  if (assets.length > 0) {
    lines.push("", "Holdings, largest first:");
    for (const a of assets.slice(0, 12)) {
      lines.push(`- ${a.name ?? "asset"} (${a.type}${a.liquid ? ", liquid" : ""}): ${ils(a.valueIls)}`);
    }
    if (assets.length > 12) lines.push(`- and ${assets.length - 12} more`);
  }
  return lines.join("\n");
}

export function formatUpcoming(payload) {
  const totals = payload?.totals ?? {};
  const lines = [
    `Planned purchases: ${ils(totals.planned)} · still upcoming ${ils(totals.upcoming)} · overdue ${ils(totals.overdue)}`,
  ];
  const items = (payload?.items ?? [])
    .filter((item) => item?.nextPayment && item.status === "planned")
    .sort((a, b) => String(a.nextPayment.date).localeCompare(String(b.nextPayment.date)));
  if (items.length === 0) {
    lines.push("", "Nothing is planned ahead right now.");
    return lines.join("\n");
  }
  lines.push("", "Next payments:");
  for (const item of items.slice(0, 15)) {
    const when = item.nextPayment.chargeDate ?? item.nextPayment.spendDate ?? item.nextPayment.date;
    const overdue = item.overdue ? " · overdue" : "";
    lines.push(`- ${when}  ${item.description}  ${ils(item.nextPayment.amount)}${overdue}`);
  }
  return lines.join("\n");
}

export const TOOLS = [
  {
    name: "penny_overview",
    description:
      "Income, spending, net, savings rate and the spending breakdown by category for one period of the household's money.",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["month", "quarter", "half", "year"],
          description: "Length of the period. Defaults to month.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          maximum: 60,
          description: "0 is the current period, 1 the one before it, and so on.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "penny_transactions",
    description:
      "Search the household's transactions by date range, free text or kind. Amounts are signed: spending is negative.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "First date, YYYY-MM-DD." },
        to: { type: "string", description: "Last date, YYYY-MM-DD." },
        search: { type: "string", description: "Text to look for in the description or the memo." },
        kind: { type: "string", enum: ["expense", "income", "all"], description: "Defaults to all." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "How many rows to return, newest first. Defaults to 25." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "penny_budgets",
    description: "Where this household month stands: spending against the monthly target, and each category budget with what is left.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "penny_net_worth",
    description: "Net worth now: assets, liquid assets, liabilities, deferred tax and the largest holdings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "penny_upcoming",
    description: "Planned purchases and their next payments, including anything overdue.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export async function callApi(path, deps = {}) {
  const baseUrl = (deps.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const headers = {};
  if (deps.workspaceId != null && deps.workspaceId !== "") headers["x-workspace-id"] = String(deps.workspaceId);

  let response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, { headers });
  } catch {
    throw new PennyError(
      `Penny is not answering at ${baseUrl}. Start the app (the Penny service, or npm start), or point PENNY_BASE_URL at the address it does answer on.`
    );
  }
  if (response.status === 401) {
    throw new PennyError("Penny is locked. Unlock the app, then ask again.");
  }
  if (!response.ok) {
    throw new PennyError(`Penny answered ${response.status} for ${path}. Check the app's settings and try again.`);
  }
  try {
    return await response.json();
  } catch {
    throw new PennyError(`Penny sent a reply that was not readable data for ${path}.`);
  }
}

export const TOOL_HANDLERS = {
  penny_overview: async (args, deps) => {
    const period = ["month", "quarter", "half", "year"].includes(args?.period) ? args.period : "month";
    const offset = intArg(args?.offset, 0, 0, 60);
    const payload = await callApi(`/api/overview?period=${period}&offset=${offset}`, deps);
    return formatOverview(payload);
  },
  penny_transactions: async (args, deps) => {
    const params = new URLSearchParams();
    const from = dateArg(args?.from);
    const to = dateArg(args?.to);
    const search = textArg(args?.search);
    const kind = ["expense", "income", "all"].includes(args?.kind) ? args.kind : "all";
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search) params.set("search", search);
    params.set("kind", kind);
    params.set("limit", String(intArg(args?.limit, 25, 1, 200)));
    const result = await callApi(`/api/transactions?${params.toString()}`, deps);
    return formatTransactions(result);
  },
  penny_budgets: async (_args, deps) => formatBudgets(await callApi("/api/summary", deps)),
  penny_net_worth: async (_args, deps) => formatNetWorth(await callApi("/api/assets", deps)),
  penny_upcoming: async (_args, deps) => formatUpcoming(await callApi("/api/planned", deps)),
};

const errorResponse = (id, code, message) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/**
 * One JSON-RPC message in, one reply out (or null for a notification).
 * Transport and protocol only: every tool is read-only.
 */
export async function handleMessage(message, deps = {}) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return errorResponse(message && "id" in message ? message.id : null, -32600, "Invalid Request");
  }
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  if (method === "initialize") {
    const requested = params?.protocolVersion;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: KNOWN_PROTOCOL_VERSIONS.has(requested) ? requested : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Read-only access to a local Penny household budget. Ask about spending, budgets, transactions, net worth and planned purchases. Nothing here can change the data.",
      },
    };
  }

  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

  if (method === "tools/call") {
    const name = params?.name;
    const handler = Object.hasOwn(TOOL_HANDLERS, name) ? TOOL_HANDLERS[name] : null;
    if (!handler) return errorResponse(id, -32602, `Unknown tool: ${String(name)}`);
    try {
      const text = await handler(params?.arguments ?? {}, deps);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: false } };
    } catch (error) {
      const text =
        error instanceof PennyError ? error.message : `The tool failed: ${error instanceof Error ? error.message : String(error)}`;
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
    }
  }

  // Notifications (initialized, cancelled) and anything else the client sends
  // that expects no answer must stay silent.
  if (isNotification || method.startsWith("notifications/")) return null;
  return errorResponse(id, -32601, `Unknown method: ${method}`);
}

/** Serves JSON-RPC over newline-delimited stdin/stdout, one reply per request, in order. */
export function run(options = {}) {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const deps = {
    baseUrl: options.baseUrl ?? process.env.PENNY_BASE_URL ?? DEFAULT_BASE_URL,
    workspaceId: options.workspaceId ?? process.env.PENNY_WORKSPACE_ID ?? null,
    fetchImpl: options.fetchImpl,
  };

  let buffer = "";
  let queue = Promise.resolve();

  const write = (message) => {
    stdout.write(`${JSON.stringify(message)}\n`);
  };

  const processLine = async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      write(errorResponse(null, -32700, "Parse error"));
      return;
    }
    const reply = await handleMessage(message, deps);
    if (reply) write(reply);
  };

  const accept = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    queue = queue.then(() => processLine(trimmed)).catch(() => {});
  };

  stdin.setEncoding?.("utf8");
  stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      accept(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  });
  stdin.on("end", () => {
    accept(buffer);
    buffer = "";
  });
  return queue;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) run();
