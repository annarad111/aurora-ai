# Aurora: implementation plan

We build Aurora one step at a time, starting with the simplest pieces. Each step ends with
something you can open and check before we move on.

Sources:
- Design: `docs/design/design_handoff_aurora_ai_chat/README.md`. The prototype is
  `Aurora v2.dc.html` in the same folder.
- Architecture: "Aurora: structura aplicației și propuneri" (one Worker, one tool registry,
  deterministic analytics, typed SSE stream).

Choices that differ from the architecture document are listed in `docs/architecture.md`
("Decisions that differ from the original plan").

## Steps

All ten steps are done; each one is a commit on `main` ("Step N: …").

| # | Step | What you can check |
|---|------|--------------------|
| 1 | **Scaffold + design system + static shell.** npm workspace, Vite + React + TypeScript app, Sass tokens (light/dark), sidebar, header, idle state, composer, empty evidence panel. | `npm run dev` shows the idle screen. The Light / Dark / System switch works and is remembered after a reload. |
| 2 | **Shared contracts + analytics package.** `packages/shared` (domain types, Zod schemas for the tools and stream events), `packages/analytics` (occupancy, ADR, RevPAR, Net RevPAR, volume/mix/price variance, status from polarity). Vitest tests with numbers worked out by hand. | `npm test` passes. Volume + mix + price equals the gap exactly. |
| 3 | **Seeded dataset with the planted story + the four tools.** A deterministic seed (cancelled MICE congress, corporate down, OTA up, weak pace), a tool registry with `get_hotel_overview`, `analyze_revenue_drivers`, `get_channel_mix`, `get_booking_pace`. | The tools return the design's numbers (€208,260 vs €242,177, and so on). |
| 4 | **Worker + SSE stream (scripted provider).** Cloudflare Worker serving the SPA and `POST /api/chat`. The orchestrator calls the tools and emits typed events (`run_started`, `step`, `kpi`, `insight`, `chart`, `text_delta`, `provenance`, `followups`, `done`, `error`). | `npm run dev` runs the Worker. The stream can be viewed with curl. |
| 5 | **Progressive answer in the UI.** SSE parser, run reducer, `useInsightRun` hook (start / stop / retry). User bubble, run steps, main finding, KPI cards, streamed explanation with clickable figures, follow-ups, Stop. | Asking a question streams the answer piece by piece. Stop keeps the partial answer. |
| 6 | **Evidence panel + linked highlighting + provenance.** Revenue bridge (SVG waterfall), channel mix, pace card, "How was this calculated?" card, contextual insight card. | Hovering or clicking a figure highlights its KPI and bar. Provenance shows the tool, formula and inputs. |
| 7 | **Explore overlay.** Occupancy, bridge, channel and pace views with toggles, tooltips and drill-down. | "Expand" and "Explore this insight" open the overlay. Esc closes it. |
| 8 | **LLM provider + number guard.** Workers AI with tool calling, the Aurora prompt, `guard.ts` (checks that every number in the text exists in the facts), automatic fallback to the scripted provider. | The answer is written by the model. A wrong number triggers the fallback. |
| 9 | **MCP endpoint.** `/mcp` built on the same registry with `createMcpHandler`, read-only tools, a token and a rate limit. | Connect from MCP Inspector and call the tools. |
| 10 | **QA + handover.** Error states, responsive layout, README, architecture/design-system docs. | Deploy with `wrangler deploy`. |

## Conventions

- English everywhere: code, comments, UI.
- Descriptive names (`roomsAvailable`, `revenueGapEur`), no single-letter variables.
- Every number shown to the user comes from the analytics package, never from the language model.
