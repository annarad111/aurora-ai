# Aurora: architecture

## One Worker, two entry points, one tool registry

```
                     ┌──────────────────────── Cloudflare Worker "aurora" ────────────────────────┐
 Browser ── GET / ──▶│ static assets (React app, web/dist)                                         │
         ── POST ───▶│ /api/chat ─▶ orchestrator ─┐                                                │
            /api/chat│   SSE stream ◀─────────────┤                                                │
                     │                            ├─▶ tools/registry.ts ─▶ packages/analytics ─▶ D1 │
 MCP client ─ /mcp ─▶│ /mcp (createMcpHandler) ───┘      (4 read-only tools)   (pure maths)         │
                     │                                                                             │
                     │ orchestrator ⇄ Workers AI (tool choice + wording only, optional)            │
                     └─────────────────────────────────────────────────────────────────────────────┘
```

- **One deploy, one origin.** The React app, the chat API and the MCP server live in the same Worker:
  no CORS, no internal network hop, one `wrangler deploy`.
- **One registry.** `worker/src/tools/registry.ts` defines each tool once (name, description, Zod input and
  output schema, handler). The chat calls it directly; `/mcp` publishes the same definitions. An analysis
  written once is available to the UI and to any agent.
- **Deterministic numbers.** Every figure comes from `packages/analytics` (pure functions, unit tested).
  The language model only chooses tools and writes sentences around placeholders; it never types a number.

## Packages

| Package | Role | Knows about |
|---|---|---|
| `packages/shared` | Contracts: domain types, tool and stream-event schemas (Zod 4), formatting, shared rules | nothing else |
| `packages/analytics` | KPIs, exact gap decomposition, channel mix, pace, status, findings | `shared` |
| `packages/demo-data` | Deterministic dataset with the planted story (fixed seed, fixed "today") | `shared`, `analytics` |
| `worker` | Routes, D1 repository, tools, orchestrator, SSE, Workers AI adapter, MCP server | all of the above |
| `web` | React + TypeScript + Sass UI | `shared` |

Rule: `analytics` knows nothing about HTTP, the model or React, so it is tested in milliseconds.

## Data

Five D1 tables, daily granularity per segment and channel (no individual reservations):
`hotels`, `channels` (commission rate), `daily_stats` (rooms, revenue, cancellations), `targets` (daily
budget per segment), `on_the_books` (snapshots of future bookings). The seed migration is generated from
`packages/demo-data` and committed, so the database content is reviewable and identical everywhere.

Targets are **daily** (the original plan had monthly): month-to-date then compares against exactly the
budget of those days, and a group block can be budgeted on its own dates.

## The answer, as a stream

`POST /api/chat` answers with Server-Sent Events, read with `fetch` + `ReadableStream` (EventSource cannot
POST or be aborted cleanly). Each event is validated with Zod when sent and when received, and carries the
run id and an increasing sequence number.

```
run_started → step (pending ×n) → per tool: step running → step done → kpi… / chart…
            → insight (as soon as the tools behind the headline answered)
            → text_delta… (figures carry a factId) → provenance… → followups → done | error
```

The order is a UX decision: the summary arrives before the details, and every step says what is happening.
Stop aborts the request; the Worker notices the closed stream and stops the run. A heartbeat comment every
15 s keeps proxies from closing the connection while the model is thinking.

In the browser, `web/src/stream/run-reducer.ts` is a pure reducer from events to screen state
(idle / streaming / done / cancelled / error). It ignores events of other runs and repeated sequence numbers,
and keeps partial answers on Stop or error.

## The language model

| Responsibility | Deterministic | Model (optional) |
|---|---|---|
| Which tools to call | keyword rules (fallback) | function calling over the 6 chat tools |
| Numbers, KPI statuses, charts, provenance | always | never |
| Headline, chips, follow-ups | always (templates) | — |
| Explanation text | templates (fallback) | writes sentences with `{placeholders}` |

The number guard rejects any model text with a digit outside a placeholder, an unknown placeholder, fewer
than three figures or the wrong length; the model gets one retry with the reasons, then the templates take
over. The `done` event reports who chose the tools, who wrote the text, and why it fell back.

Tested live with `@cf/meta/llama-3.3-70b-instruct-fp8-fast`: the model chose the tools in 8 of 8 runs and
wrote a guard-passing text in 7 of 8 (one timeout at 15 s fell back to the templates). Answers take 6–10 s.

## Conversation memory

A short question such as "and November?" or "what about weekends?" builds on the previous answer.

- Every `done` event carries a `context`: what the answer covered (intent, period, and for data questions the exact `query_performance` arguments and the main metric). It holds no figures.
- The browser keeps the last 4 turns (question + context) and sends them as `history` with the next question. Nothing about the conversation is stored on the server; "New analysis" or another hotel starts over.
- `worker/src/orchestrator/follow-up.ts` decides first, with fixed rules: a question that opens with "and / what about / only…", points back ("the same nights"), or has at most 4 words is a follow-up. It keeps the previous query and changes only what the new question mentions (period, split, filters, metric, vs last year). After an analysis, "and October?" reruns the same analysis for October; "why?" after a data question explains the gap for that period.
- When the rules don't apply, the model planner sees the earlier questions and what was looked up for them. The narrative writer is told which question a follow-up continues, so "and November?" is answered as "ADR by channel for November".
- `done.followUpOf` names the earlier question; the UI shows it above the question bubble.

## What-if simulation

`simulate_scenario` answers "what if we act on the coming nights?" with three levers: win back part of the room nights behind last year's pace, change the rate of the rooms still to sell, and move part of the OTA revenue to direct.

- The calculation is one pure function, `simulateScenario(basis, levers)` in `packages/analytics/src/scenario.ts`. The basis comes from the database (`worker/src/tools/simulate-scenario.ts`): rooms and revenue on the books, last year's rooms at the same point, the channel mix of the month so far, the commission per channel, and capacity.
- Rooms already booked keep their rate; recovered room nights are sold at the rate on the books times the rate lever, and never past a full hotel. Commission is estimated from the channel mix. The four effects (recovered nights, rate, commission on the extra revenue, commission saved by direct) add up exactly to the change in net revenue.
- The simulator in the pace Explore view calls `POST /api/simulate` once for the basis, then runs the same function in the browser on every slider move, so the numbers are the server's, without a request per move.
- MCP clients get the same tool. The chat planner leaves it out: the what-if has its own screen.

## Security (demo level)

- No keys in the frontend. Workers AI runs through the binding; the MCP token is a Worker secret.
- `/mcp` needs `Authorization: Bearer <MCP_TOKEN>` (constant-time comparison); without a configured
  token the endpoint is disabled.
- Rate limiting bindings: 20 answers/min on `/api/chat`, 60 requests/min on `/mcp`, per IP.
- Input validated everywhere: question length (≤ 280), hotel id checked against the database, tool inputs
  and outputs checked against their schemas.

## Decisions that differ from the original plan

| Plan | Built | Why |
|---|---|---|
| Tailwind + shadcn/ui | Plain Sass with BEM and CSS-variable themes | Full control over the design system, no utility classes in markup |
| pnpm workspaces | npm workspaces | Same layout, nothing extra to install |
| Monthly targets | Daily targets | Exact month-to-date, block budgeted on its dates |
| LLM writes the narrative from facts | LLM writes around placeholders | Numbers cannot be changed by the model at all |
| MCP SDK v1 + `createMcpHandler` | MCP SDK v2 + stateless `createMcpHandler` (`agents/mcp/server`) | The v1 path is deprecated in the current Agents SDK |
| Zod 3 | Zod 4 | Required by the Agents SDK; also cleared all npm audit findings |

## Scaling path

- Split the MCP server into its own Worker only when it needs a different scale or audience
  (the registry already isolates it).
- Replace the shared MCP token with OAuth, so each user sees only their own hotels.
- Move from demo data to a PMS/RMS feed writing into the same five tables.
- Add GOP/GOPPAR once operating cost data is available; Net RevPAR is the first step towards profit.
