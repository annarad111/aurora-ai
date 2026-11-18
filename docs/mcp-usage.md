# Using Aurora's analyses from any agent (MCP)

Aurora's seven tools are published as a **Model Context Protocol** server at `/mcp`.
They are the same tools the chat uses, from the same registry (`worker/src/tools/registry.ts`),
so any MCP client (Claude Desktop, Claude Code, MCP Inspector, your own agent) gets the same
numbers as the Aurora UI.

| Tool | What it answers |
|---|---|
| `get_hotel_overview` | Occupancy, ADR, RevPAR, revenue and room nights vs target and last year, per segment and per night |
| `analyze_revenue_drivers` | The revenue gap split exactly into volume, mix and pure price, per segment, with findings ranked by euro impact |
| `get_channel_mix` | Revenue share per channel vs last year and previous months, commission paid, Net RevPAR |
| `get_booking_pace` | Rooms on the books for future nights vs the same point last year, pickup of the last 7 days |
| `query_performance` | Any past metric for any period, split by night, weekday, weekend/weekday, segment or channel, with filters and last year |
| `get_group_blocks` | Named group blocks (congresses, tour groups) with nights, rooms and status, cancelled ones with their date |
| `simulate_scenario` | What-if for future stay dates: win back part of the pace gap, change the rate of rooms still to sell, move OTA bookings to direct; revenue, commission and net revenue before and after |

All tools are read-only (`readOnlyHint: true`). The server's instructions tell the client the demo
hotel id (`sablon-bru`), the fixed "today" (2026-11-17) and the date format. `simulate_scenario`
only calculates; it never changes data.

## Endpoint and access

- **Transport:** Streamable HTTP, stateless (a new server per request, no sessions).
- **URL:** `http://127.0.0.1:8787/mcp` locally (`npm run dev`), `https://aurora.<subdomain>.workers.dev/mcp` once deployed.
- **Auth:** `Authorization: Bearer <MCP_TOKEN>`.
  - Locally the token is in `.dev.vars` (create it from `.dev.vars.example`; git ignores it).
  - Deployed: `npx wrangler secret put MCP_TOKEN`.
  - Without a configured token the endpoint answers `503`, with a wrong or missing one `401`.
- **Rate limit:** 60 requests per minute per IP address (`429` with `Retry-After: 60` beyond that).
  The chat has its own limit of 20 answers per minute.

## Quick check from the terminal

```bash
npm run dev        # terminal 1
npm run mcp:try    # terminal 2: connects, lists the tools, calls analyze_revenue_drivers
```

Expected output ends with:

```
analyze_revenue_drivers, 1–17 Nov 2026:
  gap -33917 = volume -41932 + mix -6240 + price 14255
```

Against a deployed Worker: `npm run mcp:try -- https://aurora.<subdomain>.workers.dev/mcp`
(with `MCP_TOKEN` set in the environment).

## MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector: **Transport type** `Streamable HTTP`, **URL** `http://127.0.0.1:8787/mcp`,
and under **Authentication** add the header `Authorization` with `Bearer <MCP_TOKEN>`. Connect, open
**Tools**, run `analyze_revenue_drivers` with:

```json
{ "hotelId": "sablon-bru", "period": { "from": "2026-11-01", "to": "2026-11-17" } }
```

## Claude Code

```bash
claude mcp add --transport http aurora http://127.0.0.1:8787/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

Then ask, for example: *"Use the aurora tools: why is Hotel Sablon below target this month?"*

## Claude Desktop

Claude Desktop starts local MCP servers from its config file, so a small bridge (`mcp-remote`)
connects it to the HTTP endpoint. In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aurora": {
      "command": "npx",
      "args": ["mcp-remote", "http://127.0.0.1:8787/mcp", "--header", "Authorization:${AURORA_MCP_AUTH}"],
      "env": { "AURORA_MCP_AUTH": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

(The header is passed through an environment variable because some clients split arguments on spaces.)

## Design notes

- **One registry, two adapters.** The chat orchestrator calls the tools directly in the same process;
  only external clients go through MCP. No internal HTTP hop, no second Worker.
- **Validated twice.** `callTool` checks the input and the output against the Zod schemas for MCP
  calls exactly as for the chat. Bad input (unknown hotel, no budget) comes back as an MCP tool error
  (`isError: true`) the client's model can read and correct.
- **Built with** `createMcpHandler` from the Cloudflare Agents SDK (`agents/mcp/server`) over the MCP
  TypeScript SDK v2 (`@modelcontextprotocol/server`). The Worker needs the `nodejs_compat` flag for it.
- **Next steps for real users:** replace the shared token with OAuth (per-user access to their own
  hotels), and pass the hotel from the user's identity instead of the `hotelId` argument.
