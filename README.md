# Aurora

AI-first revenue assistant for hotel revenue managers.

Taking over the project? Start with [docs/handover.md](docs/handover.md) (setup, environment variables,
database, critical flows, deployment, known issues). The design decisions are in [docs/architecture.md](docs/architecture.md).

## Run it

First time only:

```bash
npm install
npm run db:migrate:local   # creates the local D1 database (.wrangler/) with the schema and the demo data
cp .dev.vars.example .dev.vars   # then put a long random string in MCP_TOKEN (enables /mcp locally)
```

Every day:

```bash
npm run dev          # Worker on :8787 + React app on :5173 (open http://localhost:5173), templates only, offline
npm run dev:ai       # same, with Workers AI writing the text (run `npx wrangler login` once first)
npm run dev:api      # only the Worker (it also serves the built React app on http://localhost:8787)
npm test             # Vitest for all packages
npm run typecheck
npm run build        # production build of the React app
npm run tools:demo             # run the four main analysis tools on the demo data, print the key numbers
npm run tools:demo -- --json   # same, full JSON output
npm run db:seed:generate       # rewrite the seed migrations (0002, 0004, 0009, 0010) after changing packages/demo-data
npm run mcp:try                # connect to /mcp as an MCP client, list the tools, call one
```

Try the stream by hand while `npm run dev:api` runs:

```bash
curl -N -X POST http://localhost:8787/api/chat \
  -H "content-type: application/json" \
  -d '{"question":"Why is my hotel revenue below target this month?","hotelId":"sablon-bru"}'
```

## Live

- App: https://aurora.radulescuana111.workers.dev
- MCP: https://aurora.radulescuana111.workers.dev/mcp (bearer token, see [docs/mcp-usage.md](docs/mcp-usage.md))

## Deploy

One-time setup (already done for the live Worker):

```bash
npx wrangler login
npx wrangler d1 create aurora-db           # put the printed id in wrangler.jsonc (both places)
npm run db:migrate:remote                  # schema + demo data into the Cloudflare database
npx wrangler secret put MCP_TOKEN --env ai # a long random string; enables /mcp
```

Every release:

```bash
npm test && npm run deploy                 # builds the React app, deploys the "ai" environment as "aurora"
```

The production MCP token is kept in `.secrets/production.env` on the machine that set it (git-ignored).
To rotate it, put a new value there and run `npx wrangler secret put MCP_TOKEN --env ai` again.

## How the language model is used

The model never computes or types a number.

1. **Planning.** Fixed rules first recognise greetings, what-if, decisions and property questions. Otherwise
   the model sees all ten tools (function calling) and picks the ones the question needs.
   The tools always run in a fixed order, and the ones the answer cannot do without are added.
2. **Writing.** The model gets a catalogue of figures, each behind a placeholder:
   `{revenue_gap} = "€33,917" (how far room revenue is BELOW target)`. It writes
   "Revenue is {revenue_gap} below target…", and Aurora replaces each placeholder with the exact value.
3. **The number guard** (`narrative-guard.ts`) rejects an answer with a digit outside a placeholder, an unknown
   placeholder, fewer than three figures, or the wrong length. The model gets one retry with the reasons.
4. **Fallback.** If the model fails, is slow (15 s) or is rejected twice, the keyword rules and the templates
   take over. The answer footer says "Scripted narrative (model unavailable)".

The headline, chips, KPI cards, charts and provenance are always deterministic; only the explanation comes from the model.

## API

<div align="center">

| Route | What it does |
|:---:|:---:|
| `GET /api/workspace?hotel=` | Everything the UI shows before a question: hotels, period, and starter questions written from the data |
| `GET /api/briefing?hotel=` | The morning briefing: up to three items ranked by fixed rules (priority, figure vs baseline, source, and the investigation each one opens) |
| `GET /api/property?hotel=` | The Property Overview: rooms tonight (occupied, vacant, out of order, out of service), events & alerts with their measured impact, and the previous completed month against target and last year, with room revenue per month |
| `GET /api/decisions?hotel=` | Saved insights, actions and the outcome of each completed action |
| `POST /api/decisions/insights` · `DELETE …/insights/:id?hotel=` | Save an insight (saving it again returns the same one) · remove it when it has no actions |
| `POST /api/decisions/actions` · `PATCH`/`DELETE …/actions/:id?hotel=` | Create, change or delete an action |
| `POST /api/chat` | `{ question, hotelId, conversationId, investigation? }` (`investigation`: the structured context of a question asked from the briefing, a chart, a KPI card or the property page) → Server-Sent Events: `run_started`, `step`, `kpi`, `chart`, `insight`, `trail`, `text_delta`, `provenance`, `followups`, `done` (or `error`). The finished answer is stored with the conversation; follow-ups use the earlier answers. |
| `GET /api/conversations?hotel=…` | The hotel's saved conversations, newest first (the "Recent" list) |
| `GET /api/conversations/:id` | One conversation with the stored events of every answer, to show it again as it was |
| `PATCH /api/conversations/:id?hotel=…` | `{ title }`: the user's own title, kept when later answers are stored |
| `DELETE /api/conversations/:id?hotel=…` | Deletes the conversation and every stored answer |
| `POST /api/simulate` | `{ hotelId, stayFrom, stayTo, paceRecovery?, rateChange?, otaToDirect? }` → the what-if result (`simulate_scenario`) |
| `GET /api/hotels/:id/overview?from=&to=` | The overview tool as plain JSON, no AI. Defaults to month to date. |
| `GET /api/health` | Worker and database status |
| `/mcp` | All ten tools, including the what-if simulation, the saved decisions, the property status and maintenance impact, for external agents (MCP, Streamable HTTP). Bearer token, 60 requests/min. See [docs/mcp-usage.md](docs/mcp-usage.md). |

</div>

`POST /api/chat` is limited to 20 answers per minute per client.

## Where things are

```
packages/
  shared/src/                   contracts used by both worker and web (Zod schemas + inferred types)
    domain.ts                   hotels, daily_stats, targets, channels, on_the_books, group blocks
    metric-meta.ts              per-KPI direction (higher/lower is better), status thresholds, KPI comparison
    findings.ts                 a fact with its euro impact; the only input for the narrative
    tools.ts, tool-names.ts     input/output of the 10 tools, and their names
    stream-events.ts            the SSE events of POST /api/chat
    investigation.ts            the structured context of a question asked from a briefing item, chart, KPI or the property page
    briefing.ts                 the morning briefing
    decisions.ts                saved insights, actions, outcomes, get_decisions
    property.ts                 property profile, rooms, room status events, property overview, get_property_status, get_room_events
    conversation.ts, ids.ts     stored conversations and their ids
    workspace.ts                what the UI loads before a question
    format.ts                   €, %, pp and counts, written the same way everywhere
  analytics/src/                pure, deterministic maths (no HTTP, no LLM, no React)
    kpi.ts                      occupancy, ADR, RevPAR, Net RevPAR, pickup
    variance.ts                 revenue gap = volume + mix + pure price (exact)
    channels.ts                 channel mix, commission cost, cost of the mix shift
    pace.ts                     on the books vs last year
    scenario.ts                 the what-if simulation (simulateScenario)
    breakdown.ts                performance split by segment or channel, ranked by change
    status.ts                   on track / watch / off track from direction + thresholds
    findings.ts                 analysis results -> findings ranked by euro impact
    aggregate.ts, dates.ts      grouping daily rows, inclusive date ranges
  demo-data/src/                deterministic demo dataset (fixed seed, fixed "today" = 17 Nov 2026)
    story.ts                    THE PLANTED STORY: every number the demo is built around
    generate-demo-dataset.ts    turns the story into daily_stats, targets and on_the_books rows
    property.ts                 property profile, 111 rooms on 6 floors, maintenance events, upcoming group
    allocate.ts                 splits whole numbers without losing any (largest remainder, matrix fitting)
  demo-data/test/               data-validity and property-data tests: nothing in the demo is impossible
wrangler.jsonc                  one Worker: static assets + D1 + rate limits + vars; env "ai" adds Workers AI
worker/
  migrations/                   0001 schema · 0002 seed (generated) · 0003 group blocks · 0004 seed (generated)
                                0005 conversations · 0006 decisions · 0007 custom titles · 0008 property
                                0009 property seed (generated) · 0010 upcoming group (generated)
  scripts/                      generate-seed-sql.ts, print-tool-outputs.ts (tools:demo), try-mcp.ts (mcp:try)
  test/                         integration tests on the in-memory repository
  src/
    index.ts                    Worker entry: builds the real dependencies (D1, Workers AI, MCP token, rate limiters, assets)
    app.ts                      the router: every /api route and /mcp, else the React app
    env.ts                      bindings and the checked config
    routes/                     one file per route (chat, conversations, briefing, property, decisions, simulate, ...)
    db/                         HotelDataRepository interface, D1 implementation (the only SQL), in-memory implementation
    tools/                      the 10 tools + registry.ts (one source for chat and MCP)
    decisions/                  decision-service.ts: the rules for insights, actions and outcomes
    sse/sse-event-stream.ts     validated, numbered SSE events, heartbeat, stop on disconnect
    orchestrator/
      run-insight.ts            the run: steps → tools → KPI/charts → insight → trail → text → provenance → follow-ups → done
      insight-plan.ts           keyword rules, investigation contexts, and turning the model's tool choice into a plan
      insight-planners.ts       KeywordInsightPlanner, LanguageModelInsightPlanner (with fallback)
      conversation.ts           greetings, small talk, off-topic questions
      follow-up.ts              follow-ups that keep what the earlier answer covered
      insight-trail.ts          the four-step trail (observation → discovery → understanding → decision)
      morning-briefing.ts       the three ranked briefing items
      decisions-answer.ts, property-answer.ts, what-if-answer.ts   answers written from tool output by fixed rules
      suggestions.ts            starter questions written from the data
      scripted-narrative-writer.ts  the words around the numbers, from templates
      language-model-narrative-writer.ts  the model writes the explanation; guard, retry, fallback
      figure-catalogue.ts       the placeholders the model may use, with their exact values
      narrative-guard.ts        rejects digits outside placeholders; fills in the values
      prompts.ts                Aurora's instructions to the model
      provenance.ts             "How was this calculated?" for every fact id
      context-notes.ts          the sentence of the contextual insight card, from the same tool output
      tool-events.ts            KPI cards and chart payloads sent after each tool
    llm/                        LanguageModel interface, Workers AI implementation
    mcp/aurora-mcp-server.ts    the MCP server: registers every registry tool (createMcpHandler, stateless)
    http/                       JSON responses, bearer token check, rate limiting
docs/
  handover.md                   start here when taking over the project
  architecture.md               the design decisions
  mcp-usage.md                  connecting an MCP client
  design-system.md, ux-rationale-validation.md
  design/design_handoff_aurora_ai_chat/   design reference (open Aurora v2.dc.html in a browser)
  implementation-plan.md                  the step-by-step plan and what to check after each step
web/
  index.html
  vite.config.ts                port 5173; proxies /api and /mcp to AURORA_API_ORIGIN (default http://127.0.0.1:8787)
  src/
    main.tsx                    entry: mounts <App> inside <ThemeProvider>, imports styles/main.scss
    app/
      App.tsx                   the three-column workspace; owns the run, the panels and the hover/selection state
      useWorkspace.ts, useConversationList.ts   the workspace data and the Recent list
      layout/                   Sidebar (property card, Decisions card, Recent with rename/delete), ThemeSwitch,
                                ConversationHeader (title, the answer's period, the demo date), EvidencePanel
    stream/
      parse-sse.ts              response body -> validated stream events (fetch + ReadableStream)
      run-reducer.ts            pure reducer: events + Start/Stop/Reset -> the answer on screen
      useConversation.ts        hook: the chat thread; ask, stop, retry, new chat, open a saved conversation
    features/
      conversation/             AnswerView, InsightTrail, StreamedExplanation, RunBanner, FollowUps, Composer
      briefing/                 MorningBriefing (the first screen of a new chat)
      investigation/            InvestigationPanel and the actions for a selected night or KPI
      decisions/                DecisionWorkspace, ActionEditor, SaveInsightButton
      property/                 PropertyOverviewPage: OperationsTonight, EventsAndAlerts, FinancialSnapshot,
                                PropertyIntelligence, EvidenceDrawer
      insights/                 MainFinding, KpiCard, ContextualInsightCard, fact-links (which elements light up together)
      evidence/                 RevenueBridgeCard / RevenueBridgeChart (+ revenue-bridge-geometry, tested),
                                ChannelMixCard, BookingPaceCard (with the what-if callout), WhatIfHint,
                                PerformanceTableCard, ProvenanceCard ("How was this calculated?")
      explore/                  ExploreOverlay (dialog, Esc, focus kept inside) with four views:
                                Occupancy, Bridge, Channel, Pace (with the ScenarioSimulator)
      empty-state/              SuggestedQuestions
    lib/                        metric-display (value, delta, status icon), dates, relative time, class-names
    design-system/
      ThemeProvider.tsx         Light / Dark, saved in localStorage
      icons.tsx                 inline SVG icons
    styles/                     Sass, no Tailwind (see below)
```

## Styling

Plain Sass (SCSS), with BEM class names (`.block__element--modifier`).

<div align="center">

| Folder | What it holds |
|:---:|:---:|
| `styles/themes/_palette.scss` | Light and dark colour maps. **Change a colour here.** |
| `styles/themes/_theme-variables.scss` | Turns the maps into CSS variables (`--color-petrol`, ...) and defines semantic aliases (`--color-ai`, `--color-status-off-track`, ...). |
| `styles/abstracts/_variables.scss` | Spacing, type scale, radii, shadows, motion, layout widths. |
| `styles/abstracts/_mixins.scss` | The text roles (`text-page-title`, `text-key-figure`, `text-section-title`, `text-item-title`, `text-body`, `text-label`, `text-meta`), plus `eyebrow`, `unstyled-button`, `focus-visible-ring`, `tabular-numbers`, `below-breakpoint`. |
| `styles/components/_brand-accents.scss` | The violet accents next to the petrol (loaded last). |
| `styles/base/_scrollbars.scss` | The thin, faded violet scrollbars. |
| `styles/base/` | Reset, body typography, shared keyframes. |
| `styles/layout/_workspace.scss` | The three-column layout and how it stacks on narrow screens. |
| `styles/components/` | One partial per component, named like the component. |

</div>

Colours are CSS variables, so the theme switches at runtime without reloading.
Everything else is a Sass variable and is resolved at build time.
