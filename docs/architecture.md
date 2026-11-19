# Aurora: architecture

## One Worker, two entry points, one tool registry

```
                     ┌──────────────────────── Cloudflare Worker "aurora" ────────────────────────┐
 Browser ── GET / ──▶│ static assets (React app, web/dist)                                         │
         ── POST ───▶│ /api/chat ─▶ orchestrator ─┐                                                │
            /api/chat│   SSE stream ◀─────────────┤                                                │
                     │                            ├─▶ tools/registry.ts ─▶ packages/analytics ─▶ D1 │
 MCP client ─ /mcp ─▶│ /mcp (createMcpHandler) ───┘      (10 read-only tools)  (pure maths)         │
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

Twelve D1 tables (migrations 0001–0010 in `worker/migrations/`):

| Group | Tables |
|---|---|
| Results and plans, daily per segment and channel (no individual reservations) | `hotels`, `channels` (commission rate), `daily_stats` (rooms, revenue, cancellations), `targets` (daily budget per segment), `on_the_books` (snapshots of future bookings), `group_blocks` (confirmed and cancelled groups) |
| The property | `property_profiles` (address, type, room types), `rooms` (111 numbered rooms with floor and type), `room_status_events` (out of order / out of service) |
| What users create | `conversations` and `conversation_turns` (every finished answer with its streamed events), `decision_records` (saved insights and actions, as versioned JSON) |

The seed migrations (0002, 0004, 0009, 0010) are generated from `packages/demo-data` with
`npm run db:seed:generate` and committed, so the database content is reviewable and identical everywhere.
A change to the seed of a migration that production already applied goes into a new migration.

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
| Which tools to call | keyword rules (fallback) | function calling over all 10 tools |
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
- While Aurora works, the four steps wait as dim placeholders and the first one breathes, with a plain sentence of what is happening ("Checking bookings for the coming nights…"). When the trail arrives, the steps light up one after another (0.7 s apart): the light comes on, the line grows to the next step and the words fade in, like streamed text. An answer opened from history, or a reader with reduced motion, sees every step at once. Each step that links to a figure lights the same chart bar when hovered.
- The card follows the theme: a soft light card with deeper step colours in Light, the night-blue card in Dark (`trail-*` colours in `_palette.scss`).
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

## Insight to action

- A briefing item or a finished answer can be saved ("Save insight"). The saved record keeps the title, the figure and its baseline as they were, the period, the evidence (fact and tool), the conversation it came from, and the question and context that investigate it again.
- From a saved insight the user creates actions (title, description, priority, status, optional owner and due date, notes). The editor starts from **Aurora's suggestion**, written by fixed rules from the insight's metric and labelled as such; nothing is stored until the user saves it.
- The decision workspace (sidebar → Decisions) lists saved insights with their actions, filtered by status and priority, and reopens the original conversation as it was, or investigates again on today's data.
- **Outcome**: for a completed action, the server measures the same figure on the nights after completion (rates and ratios via `query_performance`, OTA share via `get_channel_mix`, pace with a new bookings count). It is shown as *observed*, before and after, with "not verified as caused by this action". Totals over periods of different length are not compared. Without data after completion it says "Outcome not yet measurable" (always the case in the demo, whose data stops on 17 November).
- **Storage**: D1 table `decision_records` (migration 0006). One row per insight or action, the record as JSON with a `record_version`. Every record is validated on read; one of another version or damaged is skipped and counted (`unreadableRecordCount`), never fatal. A unique index on `(hotel_id, kind, source_key)` makes saving twice a no-op. Rules (no duplicates, no removing an insight that has actions, `completedAt` on completion) live in `worker/src/decisions/decision-service.ts`.
- **Limitation**: the demo has no sign-in, so decisions are per hotel and shared by everyone who opens the demo.
- **Asking about decisions**: the read-only tool `get_decisions` returns the saved insights and actions (open first, high priority first, then the earliest due date), with an overdue flag and the outcome of completed actions. Questions like "what decisions are saved?", "which actions are high priority?" or "what is overdue?" are recognised by fixed rules in both planners (`decisions-answer.ts`); the model planner may also choose the tool for other wordings. The answer is written from the records by fixed rules, so titles, owners, dates and statuses are exactly what was saved, and the trail ends with "Open Decisions". MCP agents get the same tool.

## Property overview

- The sidebar's property card has **See overview**: a page about the hotel itself, built from `GET /api/property`. It answers what the hotel is, what its rooms are doing tonight, and how last month went. The detailed analysis stays in the chat: every figure on the page can start an investigation there (`origin: "property"`).
- **Data** (migrations 0008–0009, `packages/demo-data/src/property.ts`): a property profile (country, type, room types), 111 numbered rooms and a few maintenance events. All of it is **fictional demo data**, labelled as such on the page and in answers. It is built to agree with the results: the room types add up to 111, and on every night of a maintenance event rooms sold (or booked) plus rooms under maintenance never exceed 111 (tested).
- **Room inventory**, for one night (`get_property_status`):
  - physical rooms = every room (111)
  - occupied = rooms sold that night (results); for a future night, rooms **booked so far** as of the bookings snapshot, never called occupied
  - out of order = broken, out of inventory; out of service = briefly held back
  - vacant & available = physical − occupied − out of order − out of service; sellable = physical − out of order − out of service
  - The four statuses are mutually exclusive and add up to the physical rooms; the page shows the sum.
  - Arrivals and departures need reservations, which the dataset does not have: the page and the chat say so instead of estimating them.
- **Financial snapshot**: the previous completed calendar month (October 2026 on the demo's today) from `get_hotel_overview`: room revenue, occupancy, ADR and RevPAR against target and last year, each with its definition. Room revenue per month goes back as far as the results do (August 2026); the current month is drawn striped and labelled "so far".
- **Asking Aurora**: questions like "how many rooms are available?", "which rooms are out of order?", "how many rooms does the hotel have?" or "how many rooms are free on 24 November?" are recognised by fixed rules (`property-answer.ts`), and the model may choose `get_property_status` for other wordings. The answer is written from the tool output and ends with a button to the exact section ("See the room inventory", "See the property"); a data answer about exactly last month links to the financial snapshot. The page then scrolls to the section, focuses it and highlights it once.
- There is no Performance page yet: the snapshot's "Investigate with Aurora" opens the analysis in the chat instead.
- **Events & alerts**: maintenance (the last 14 days to 30 days ahead), confirmed group arrivals (next 30 days) and group cancellations (made in the last 30 days), running work first. Rooms with the same work on the same nights are one event. Each event opens in place with its details and ways to look further: "Investigate revenue impact" (chat, `intent: "maintenance_impact"` with the event id and rooms), "Show in room inventory", "View evidence".
- **What maintenance costs, measured** (`get_room_events`): a room out of order only costs a sale on a night the hotel is full. For every night of an event, vacant = physical − sold (or booked so far, for a future night) − every unsellable room; the event reports its room nights, the full nights and the tightest night. On the demo data no maintenance night was full (the tightest had 24 vacant rooms), so the answer is "has not cost a sale", with future nights marked as based on the bookings so far. No euro amount is estimated.
- **Property intelligence** reuses the morning briefing's ranked findings (not a second ranking), plus what the rooms say tonight; each line can be investigated, saved to Decisions, or checked.
- **Evidence drawer**: the page's figures (rooms tonight, each KPI, each event, each finding) open the same "How was this calculated?" card as an answer, in a drawer at the side (a bottom sheet on a phone) that takes no space until asked for and closes with Escape.
- A fictional confirmed group (Atelier Verdi product launch, 26–27 Nov, 14 rooms a night) was added in migration 0010; its rooms fit inside the bookings already on the books for those nights (tested).

## Demo data you can trust

- `packages/demo-data/test/data-validity.test.ts` checks, on every change, that nothing in the demo is impossible: never more rooms sold, budgeted or on the books than the hotel has (111), no negative values, an average rate between €100 and €300 a night, bookings only for future nights and never shrinking as a night gets closer, groups that fit the hotel and show up in the results, and room numbers that follow the floor.
- `worker/test/property.test.ts` checks that the KPIs on screen follow their definitions (occupancy = rooms sold / rooms available, ADR = revenue / rooms sold, RevPAR = revenue / rooms available = ADR × occupancy) and that tonight's occupied rooms are the rooms sold that night.
- Room numbers follow the usual hotel rule: the first digit is the floor, the last two the room on it (305 = floor 3, room 5). Six floors, 101–119 up to 601–618, 111 rooms. The Property Overview says so, and the chat names the floor ("room 305 on floor 3").

## Typography

One set of text roles for the whole app (`web/src/styles/abstracts/_mixins.scss`), from most to least important: page title, key figure, section title, item title, body, label, meta. Sizes follow a ~1.2 ratio so each step is visibly different; weight and colour separate roles that share a size. The figure a card exists for is always the largest thing on it; periods, sources and definitions are always the quietest.

## What-if simulation

`simulate_scenario` answers "what if we act on the coming nights?" with three levers: win back part of the room nights behind last year's pace, change the rate of the rooms still to sell, and move part of the OTA revenue to direct.

- The calculation is one pure function, `simulateScenario(basis, levers)` in `packages/analytics/src/scenario.ts`. The basis comes from the database (`worker/src/tools/simulate-scenario.ts`): rooms and revenue on the books, last year's rooms at the same point, the channel mix of the month so far, the commission per channel, and capacity.
- Rooms already booked keep their rate; recovered room nights are sold at the rate on the books times the rate lever, and never past a full hotel. Commission is estimated from the channel mix. The four effects (recovered nights, rate, commission on the extra revenue, commission saved by direct) add up exactly to the change in net revenue.
- The simulator in the pace Explore view calls `POST /api/simulate` once for the basis, then runs the same function in the browser on every slider move, so the numbers are the server's, without a request per move.
- MCP clients get the same tool.

- **In the chat**: what-if questions ("what if we win back half the gap?", "what if we raise the rate by 5%?", "what if 20% of OTA bookings came direct?") are recognised by fixed rules (`what-if-answer.ts`), and the model may choose `simulate_scenario` for other wordings. The answer is written from the tool output, says it is a calculation on the bookings on the books (not a forecast), sends the pace chart so the evidence panel shows it, and ends with "Open the what-if simulator". A rate change alone only applies to rooms still to sell, so the answer says it changes nothing on its own and shows it combined with half the gap won back. With no lever named, "win back half the gap" is used as a labelled example.
- **Telling people it exists**: the pace card's button reads "Expand · What-if" and has a what-if callout (open the simulator, or ask Aurora); a one-time pop-up points at the button the first time a pace card appears (remembered in the browser after "Got it"); the simulator lists questions to ask Aurora; and answers about pace or the revenue gap offer "What if we win back half the gap?" as a follow-up.

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
- Move from demo data to a PMS/RMS feed writing into the same results, plans and property tables.
- Add sign-in and per-hotel authorization on `/api/*` before real users (today anyone with the URL can
  read and change conversations and decisions).
- Add CI (typecheck + tests on every push) and a staging environment with its own D1 database.

For running, deploying and taking over the project, see [handover.md](handover.md).
- Add GOP/GOPPAR once operating cost data is available; Net RevPAR is the first step towards profit.
