# Connecting an AI agent over MCP

Penny ships a small [MCP](https://modelcontextprotocol.io/) server, so Claude, ChatGPT or any
agent that speaks MCP can ask about the household's money in plain words: which subscriptions got
more expensive, where a household month went, what is coming up before payday.

It is deliberate about what it can do:

- **Read-only.** Every tool asks the running app over its local HTTP API. There is no tool that
  writes, categorizes, syncs or deletes anything.
- **Local.** It is a stdio process, not a port. Nothing leaves the machine except the calls it makes
  to `127.0.0.1`, and the app must already be running.
- **No new credentials.** It uses the same local API the browser uses, so it works only where the
  app itself is reachable. If the app lock is on, it answers "Penny is locked" until you unlock.

## Tools

| Tool | What it answers |
|---|---|
| `penny_overview` | Income, spending, net, savings rate and the breakdown by category for a month, quarter, half year or year |
| `penny_transactions` | Search by date range, free text or kind, newest first |
| `penny_budgets` | This household month against the monthly target, and every category budget with what is left |
| `penny_net_worth` | Net worth, liquid assets, liabilities, deferred tax and the largest holdings |
| `penny_upcoming` | Planned purchases and their next payments, including overdue ones |

## Run it

The app must be running (the Penny service, `npm start`, or `npm run dev`). Then:

```bash
npm run mcp
```

A normal run prints nothing: it waits for JSON-RPC messages on stdin.

| Environment variable | Default | What it does |
|---|---|---|
| `PENNY_BASE_URL` | `http://127.0.0.1:41234` | Where the app answers. `npm run dev` serves port 3000. |
| `PENNY_WORKSPACE_ID` | the default workspace | Reads a specific household workspace |

## Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart Claude:

```json
{
  "mcpServers": {
    "penny": {
      "command": "node",
      "args": ["/absolute/path/to/Penny/scripts/mcp.mjs"]
    }
  }
}
```

On Windows use forward slashes or doubled backslashes in the path.

## Claude Code

```bash
claude mcp add penny -- node /absolute/path/to/Penny/scripts/mcp.mjs
```

## Any other MCP client

Point it at a stdio server whose command is `node` and whose arguments are the absolute path of
`scripts/mcp.mjs`. Server name `penny`, version `0.2.0`. It answers `initialize`, `tools/list`,
`tools/call` and `ping`, and it handles the `2024-11-05`, `2025-03-26` and `2025-06-18` protocol
versions.

## Notes

- Amounts are in shekels, rounded, with spending negative.
- Category names are whatever the household named them, in its own language.
- The tools read the app's own endpoints, so a household month that starts on the 10th is respected
  the same way the dashboard respects it.
- Running it against the demo (`npm run demo`, then `PENNY_BASE_URL=http://127.0.0.1:3000`) is a
  safe way to try it without touching real data.
