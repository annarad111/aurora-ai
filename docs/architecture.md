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

## Conversations

Aurora is a chat: questions and answers stack in one thread, and every conversation is saved.

- **Stored answers.** The browser makes a conversation id when a chat starts and sends it with every question. When an answer finishes, the Worker stores it in D1 (`conversations`, `conversation_turns`) with the exact events it streamed. `GET /api/conversations?hotel=…` lists them for "Recent"; `GET /api/conversations/:id` returns them, and the browser rebuilds each answer from its events at once: no tools, no model, no streaming or animations. A stopped or failed answer is not stored.
- **Titles.** A conversation is named after its first question about the data ("hello" does not name it).
- **Follow-ups.** The Worker reads what the earlier answers covered from their stored `done.context` (last 4), so "and November?" or "what about weekends?" keeps everything the previous answer covered and changes only what the new question mentions (`worker/src/orchestrator/follow-up.ts`). When the rules don't apply, the model planner sees the earlier questions, and the writer is told which question a follow-up continues.
- **Talking, not only analysing.** `worker/src/orchestrator/conversation.ts` recognises greetings, small talk, thanks and "what can you do?" and answers them in words ("Hello, what would you like to see today about your business?"). A message outside the hotel's business is declined politely; with the model on, the model writes that reply, checked to contain no figures. Such replies run no tools, and `done.answerKind` is `conversation`.
- **Suggestions from the data.** The starter questions and the ones offered after a greeting are written from today's numbers (`worker/src/orchestrator/suggestions.ts`): revenue below or above target, pace behind last year, a rising OTA share, a cancelled group block. Nothing is seeded or typed in by hand.

## The insight trail

Answers are read by people who run a hotel, not by developers, so the chat never shows tool or function names. Instead, each analysis opens with the **Aurora insight trail**: four steps from the question to a decision.

| Step | Answers | Example |
|---|---|---|
| Observation | What happened | Room revenue is €33.9k below target for 1–17 Nov 2026. |
| Discovery | What caused it | 204 room nights were lost when the EU Health Congress on 10–12 November was cancelled. |
| Understanding | Why it matters | Fewer nights cost more than the higher rates brought in. |
| Decision | What to do next, with a button | Bookings for 21–30 November are 16% behind last year → Explore recovery scenarios |

- `worker/src/orchestrator/insight-trail.ts` writes the steps from the tool results by fixed rules (no model), so every number is exact, and sends them as a `trail` event after the tools, before the text.
- While Aurora works, the four steps are dim and the current one glows, with a plain sentence of what is happening ("Checking bookings for the coming nights…"). Each step that links to a figure lights the same chart bar when hovered.
- The tool names stay where they belong: in "How was this calculated?" and in the MCP server.

## Morning briefing

- A new chat opens with the briefing (`GET /api/briefing`): the three things that deserve attention today, built in `worker/src/orchestrator/morning-briefing.ts`.
- Each candidate is a rule over one tool result (pace vs last year, revenue vs target, booking-site share vs last year, a segment short of plan, a cancelled block, ADR above target). A rule sets the priority (critical, important, opportunity) and a severity: how far the figure is from its baseline, as a fraction.
- Items are ranked by priority, then severity, then by what can still be changed (pace first). An item is left out when a chosen one already explains it (the revenue item names the cancelled congress, so the block is not repeated).
- No model writes the briefing, and nothing is estimated: every figure is a tool output, with its source and period on the card.
- The five tools are read independently. One that fails is listed in `unavailableSources`, and the briefing is built from the rest (the UI says which data is missing).
- An item's action sends its question **and** an `investigation` context (`intent`, `dateRange`, `metric`, `segment`, `channel`, `insightId`) with the chat request. The server then runs exactly that analysis on those dates (`planForInvestigation`), with no planner and no model choosing tools (`toolsChosenBy: "context"`). `run_started` carries the context, so a reopened conversation still shows where the question came from.

## Investigating a selection

- Charts are entry points: every night of the occupancy chart (Explore), every stay date of the pace chart (Explore, and the per-night strip of the pace card in the evidence panel) is a button. Click, or Tab into the chart and use the arrow keys, Home/End, Enter; Escape clears the selection first and only then closes the dialog.
- The selected night opens an investigation panel (`web/src/features/investigation/`): the figure, its target and last year, a note from the data (a cancelled block), the source, and actions. Below 900px it is a bottom sheet.
- A selected KPI card gets the same kind of actions in its contextual card: why it changed, compare with last year, contributing segments (channels for Net RevPAR). "How was this calculated?" is the evidence.
- Actions are built by one pure function (`actionsForSelection`) from the selection, so they depend on what was selected: a past night is explained by segment, a future night by its bookings, a KPI by the revenue (or channel) analysis.
- Asking sends the question with an `investigation` context (`origin: chart | kpi`, `interaction`, `metric`, `date`, `dateRange`, `breakdown`, `selectedValue`, `baseline`). The server plans from it (`planForInvestigation`): a data question becomes a validated `query_performance` call on those nights, against last year, ranked by change; dates that do not fit fall back to month to date.
- The question line keeps the selection readable after the chart is gone ("From the chart · Wed 11 Nov · occupancy 37.8% vs 93.7% target"), also when the conversation is reopened.
- Stale answers cannot replace newer ones: a new question aborts the previous request, and the reducer ignores events of any other run.

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
