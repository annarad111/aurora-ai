# Aurora: technical handover

> Written on 19 Nov 2026 from the code on `main` (commit `de310ac`). Anything marked
> `[TO BE COMPLETED MANUALLY]` cannot be worked out from the code and has to be filled in by the project owner.

## 0. In short

| | |
|---|---|
| **Name** | Aurora |
| **What it does** | An AI assistant for hotel revenue managers. The user asks a question ("Why are we below target this month?"). Aurora picks the analysis tools it needs, computes the figures deterministically from the database and streams the answer (SSE) with KPIs, charts, where every figure comes from (provenance) and next steps. The app also has a Morning Briefing, a Property Overview page (rooms, events, financials), a Decisions workspace (saved insights → actions → outcome) and a what-if simulator. The same 10 tools are offered to external AI agents over MCP. |
| **Stage** | Working MVP, live on Cloudflare: https://aurora.radulescuana111.workers.dev. It runs on **deterministic demo data** (one hotel, `sablon-bru`, 111 rooms, "today" fixed at 17 Nov 2026). It is not connected to a real PMS. |
| **Users** | B2B: hotel revenue managers (UI) and external AI agents (MCP). The project is an independent concept for the "Juyo assessment" (see `package.json`). `[TO BE COMPLETED MANUALLY]`: the real users targeted after the demo, if any. |

Related documents already in the repo:
- [README.md](../README.md): commands and the list of routes
- [architecture.md](architecture.md): the architecture decisions in more detail
- [mcp-usage.md](mcp-usage.md): how to connect an MCP client
- [design-system.md](design-system.md): tokens and visual rules
- [ux-rationale-validation.md](ux-rationale-validation.md): the reasoning behind the UX

---

## 1. Architecture & tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 6, **Sass** (no Tailwind, no UI kit), no router: one page with local state |
| Backend | One **Cloudflare Worker** (TypeScript, `compatibility_date` 2025-09-01, `nodejs_compat`). Hand-written routing in `worker/src/app.ts`, no framework. |
| Contracts | **Zod 4** in `packages/shared`: the same schemas validate on the server and in the browser (every SSE event included). |
| Database | **Cloudflare D1** (SQLite), binding `DB`, database `aurora-db` |
| AI | **Workers AI**, binding `AI`, model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Only in the `ai` environment. The model picks the tools and writes the text, but **never writes a figure** (see §5.2). |
| MCP | `agents` (Cloudflare Agents SDK, `createMcpHandler`, stateless, Streamable HTTP) and `@modelcontextprotocol/server` |
| Rate limiting | Cloudflare `ratelimits` bindings: chat 20/min, MCP 60/min, per IP |
| Tests | Vitest 3 in every package (about 400 tests). UI tests use `renderToStaticMarkup`, no DOM. |
| Hosting | Cloudflare Workers: one origin serves the static assets, the API and `/mcp` |
| CI/CD | **None.** Deploys are manual (`npm run deploy`). There is no `.github/` folder. `[TO BE COMPLETED MANUALLY]` if a pipeline is wanted. |

### Main data flow

```
                ┌──────────────────────── Cloudflare Worker "aurora" ─────────────────────────┐
 Browser ─GET /─▶ ASSETS (web/dist, SPA fallback)                                              │
   React │                                                                                     │
         ├─GET /api/workspace|briefing|property|decisions ─▶ routes/* ─┐                        │
         ├─POST /api/chat ──▶ routes/chat ─▶ orchestrator/run-insight ─┤                        │
         │  ◀── SSE: run_started, step, kpi, chart, insight,           │                        │
         │       text_delta, provenance, followups, done               ├─▶ tools/registry.ts    │
         ├─POST /api/simulate ─────────────────────────────────────────┤   (10 tools, Zod I/O)  │
         │                                                             │        │               │
 Agent ──┴─/mcp (Bearer MCP_TOKEN) ─▶ mcp/aurora-mcp-server ───────────┘        ▼               │
   MCP                                                               packages/analytics (pure   │
                                                                     maths) ◀─ db/D1 repository ─▶ D1
          orchestrator ⇄ Workers AI (only the tool choice + text with placeholders; optional)   │
          orchestrator ─▶ D1: stores the finished answer (conversation_turns)                  │
                └──────────────────────────────────────────────────────────────────────────────┘
```

Principles (applied throughout the code):
1. **One origin, one deploy.** No CORS and no internal network hop.
2. **One tool registry** (`worker/src/tools/registry.ts`), used by both the chat and MCP.
3. **Deterministic figures.** They come only from `packages/analytics` (pure functions) and fixed rules. The language model is optional: without it the app works the same, with templates.

---

## 2. Folder structure

A monorepo with **npm workspaces**:

```
aurora-ai/
├─ wrangler.jsonc            Worker config: assets, D1, rate limits, vars; the "ai" environment adds Workers AI
├─ package.json              root scripts (dev, test, deploy, migrations)
├─ .dev.vars.example         template for the local secrets (MCP_TOKEN)
├─ docs/                     architecture, MCP, design system, UX, this handover
├─ packages/
│  ├─ shared/src/            Zod CONTRACTS + types: domain, tools, tool-names, stream-events,
│  │                         investigation, decisions, property, briefing, format (€, %, pp)
│  ├─ analytics/src/         PURE MATHS: kpi, variance (gap = volume + mix + price), channels,
│  │                         pace, scenario (what-if), breakdown, status, findings. No HTTP/LLM/React.
│  └─ demo-data/src/         The deterministic DEMO DATASET: story.ts (the planted story: the cancelled
│                            congress etc.), generate-demo-dataset.ts, property.ts (111 rooms, 6 floors, events)
├─ worker/
│  ├─ migrations/            0001–0010 *.sql (0002, 0004, 0009, 0010 are GENERATED, never edit them by hand)
│  ├─ scripts/               generate-seed-sql.ts, print-tool-outputs.ts, try-mcp.ts
│  ├─ test/                  integration tests on the in-memory repository
│  └─ src/
│     ├─ index.ts            entry point: builds the real dependencies (D1, AI, secrets, rate limiters)
│     ├─ app.ts              the router (every route in one place)
│     ├─ env.ts              bindings + reading/checking the variables, with defaults
│     ├─ routes/             one file per route
│     ├─ tools/              the 10 tools + registry.ts
│     ├─ orchestrator/       running one answer: planning, tools, text, number guard, provenance,
│     │                      rule-written answers (decisions/property/what-if/briefing)
│     ├─ db/                 HotelDataRepository (interface), the D1 implementation (the only SQL),
│     │                      the in-memory implementation (tests, scripts)
│     ├─ decisions/          decision-service.ts (insights, actions, outcomes)
│     ├─ llm/                the LanguageModel interface + the Workers AI adapter (with timeout)
│     ├─ mcp/                the MCP server (registers every tool in the registry)
│     ├─ sse/                validated, numbered SSE stream, with heartbeat, stopped on disconnect
│     └─ http/               JSON responses, Bearer token (constant-time comparison), rate limit
└─ web/
   ├─ vite.config.ts         proxies /api and /mcp → AURORA_API_ORIGIN (default 127.0.0.1:8787)
   └─ src/
      ├─ app/                App.tsx, layout/ (Sidebar, ConversationHeader, EvidencePanel, ThemeSwitch)
      ├─ features/           briefing, conversation, decisions, empty-state, evidence (cards,
      │                      what-if), explore (the simulator overlay), insights, investigation, property
      ├─ stream/             parse-sse.ts (fetch + ReadableStream), run-reducer.ts (the state of one
      │                      answer), useConversation.ts
      ├─ design-system/      ThemeProvider (Light/Dark), icons
      ├─ lib/                formatting of dates, metrics, relative time
      └─ styles/             Sass 7-1: abstracts (tokens, text-* typography mixins),
                             base, components, layout, themes; main.scss
```

Dependencies go one way only: `shared` ← `analytics` ← `demo-data` ← `worker`, and `web` depends only on `shared` and `analytics`.

---

## 3. Local setup & environment variables

### Requirements
- **Node.js 22** (the project runs on v22.15.1; there is no `.nvmrc` or `engines`) and npm.
- Docker, Python etc. are **not** needed. Wrangler (the Cloudflare CLI) is a devDependency.
- For the AI mode only: a Cloudflare account and `npx wrangler login`.

### Getting started
```bash
npm install
npm run db:migrate:local          # creates the local D1 in .wrangler/ with the schema + the demo data
cp .dev.vars.example .dev.vars    # put a long random string in MCP_TOKEN (only if you want /mcp locally)

npm run dev       # Worker :8787 + Vite :5173, no AI, works offline → http://localhost:5173
npm run dev:ai    # the same with Workers AI (needs wrangler login; the model always runs in the cloud)
npm test          # Vitest in every package
npm run typecheck
```

Useful:
- `npm run tools:demo [-- --json]` runs the tools on the demo data.
- `npm run mcp:try` connects to `/mcp` as a real client.
- Worker on another port: `AURORA_API_ORIGIN=http://127.0.0.1:8789 npm run dev:web`.

### Environment variables

Secrets (the `.dev.vars` file locally, `wrangler secret put` in production):

| Variable | Purpose | Example format |
|---|---|---|
| `MCP_TOKEN` | Bearer token for `/mcp`. Missing → `/mcp` is disabled. | `9fK2…` (≥ 24 random characters, base64url) |

Public variables (`vars` in `wrangler.jsonc`, set separately for the default and the `ai` environment):

| Variable | Purpose | Example / default |
|---|---|---|
| `NARRATIVE_PROVIDER` | `scripted` = templates only; `llm` = Workers AI with template fallback | `scripted` (default), `llm` (env `ai`) |
| `AI_MODEL` | The Workers AI model | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `AI_TIMEOUT_MS` | How long one model call may take before the templates take over | `15000` |
| `DEMO_TODAY` | The hotel's "today". The demo data is generated around it. | `2026-11-17` |
| `STREAM_STEP_DELAY_MS` | Pause between the stream's steps (cosmetic); `0` turns it off | `450` |
| `TEXT_TOKEN_DELAY_MS` | Pause between streamed words; `0` turns it off | `30` |

Build and dev variables (shell, not the Worker):

| Variable | Purpose | Example |
|---|---|---|
| `AURORA_API_ORIGIN` | Where the Vite proxy sends `/api` and `/mcp` | `http://127.0.0.1:8787` |

Bindings (not variables, but required): `DB` (D1), `ASSETS`, `AI` (only `ai`), `CHAT_RATE_LIMITER`, `MCP_RATE_LIMITER`.

The production MCP token is kept locally in `.secrets/production.env` (ignored by git) on the machine that set it. `[TO BE COMPLETED MANUALLY]`: hand it over through a secure channel (never through the repo or a chat).

---

## 4. Database & data models

D1 (SQLite). The granularity is **daily, per segment and channel**; there are no individual reservations.

| Table | Key | Contents |
|---|---|---|
| `hotels` | `id` | name, city, `room_count`, currency (EUR only), timezone |
| `channels` | `code` (direct/ota/gds/wholesale) | `commission_rate` |
| `daily_stats` | (hotel, date, segment, channel) | `rooms_sold`, `room_revenue`, `cancellations` (actuals) |
| `targets` | (hotel, date, segment) | daily budget: rooms and revenue |
| `on_the_books` | (hotel, snapshot_date, stay_date) | future bookings as of a given date (pace) |
| `group_blocks` | `id` | groups/MICE: nights, rooms per night, `confirmed`/`cancelled` + `cancelled_on` |
| `conversations` | `id` (made in the browser) | title, `title_is_custom`, hotel, timestamps |
| `conversation_turns` | (conversation_id, position), `ON DELETE CASCADE` | the question + the **exact SSE events** (`events_json`), replayed without running the tools again |
| `decision_records` | `id` | insights and actions as **versioned JSON** (`record_version`, `record_json`); `source_key` is unique per hotel and kind (saving twice keeps one row), `parent_id` links an action to its insight |
| `property_profiles` | `hotel_id` | address, property type, `room_types_json`, `is_demo_data` |
| `rooms` | (hotel, room_number) | floor, room type (101–119 … 601–618 = 111 rooms) |
| `room_status_events` | `id` → FK (hotel, room) | `out_of_order` / `out_of_service`, reason, nights |

Relationships: everything hangs off `hotels.id`. A conversation has many turns. An insight has many actions (through `parent_id`, no foreign key). A room has many status events.

Worth knowing:
- `suggested_questions` and `asked_questions` (from 0003) were **dropped in 0005**.
- `decision_records` has no per-field columns: the Worker validates every record with Zod when it reads it and skips one that no longer fits. The format changes through `DECISION_RECORD_VERSION`, not through a migration.

### Migrations and seed

```bash
npm run db:migrate:local     # local (.wrangler/)
npm run db:migrate:remote    # production (env ai), always BEFORE deploying when there are new migrations
npm run db:seed:generate     # rewrites 0002, 0004, 0009, 0010 from packages/demo-data
```

Rules:
- Migrations that have already been applied are **never edited**; add `0011_*.sql` instead.
- After a change in `packages/demo-data`, run `db:seed:generate`. Careful: if the seed of an already applied migration changes, production does **not** apply it again, so the change has to go into a new migration (this is what 0010 is).
- The tests `packages/demo-data/test/data-validity.test.ts` and `property-data.test.ts` check that the data is plausible (occupancy ≤ 100%, budget ≤ capacity, valid room numbers etc.).

---

## 5. Critical flows & business logic

### 5.1 A chat answer (`POST /api/chat`)
1. `routes/chat.ts` applies the rate limit (20/min/IP), validates `{ question, hotelId, conversationId, investigation? }` and opens an SSE stream (`sse/sse-event-stream.ts`): Zod-validated events with a `runId` and an increasing `sequence`, a heartbeat, and the run stops if the client disconnects.
2. **Planning** (`orchestrator/insight-planners.ts`, `insight-plan.ts`). The rules are checked in this order: greeting/social → what-if → decisions → property → follow-up → off-topic → keywords.
   - With the LLM: the model gets the tools through function calling, and its choice is turned into a plan. The tools an answer cannot do without are added anyway, and they always run in a fixed order.
   - Without the LLM, or if the model fails: keyword rules.
   - An `investigation` (context sent from the briefing, a chart, a KPI card or the property page) fixes the intent, the period, the segment etc.
3. `run-insight.ts` runs the tools and after each one sends `step`, `kpi` and `chart` (`tool-events.ts`). Then come `insight` (the headline), `text_delta`, `provenance` (for every `factId`), `followups` and `done`.
4. Rule-written plans (decisions, property, maintenance impact, what-if, morning briefing) go through the `emitWrittenAnswer` helper, without the LLM.
5. The finished answer is stored in `conversation_turns` (through `waitUntil`). The first analytical answer gives the conversation its title, unless the user renamed it (`title_is_custom`).
6. The client: `web/src/stream/parse-sse.ts` reads the stream (fetch + ReadableStream, so it can POST and abort), and `run-reducer.ts` builds the state that is shown.

### 5.2 The number guard (why the LLM cannot make up figures)
1. `figure-catalogue.ts` gives the model only placeholders with a meaning, for example `{revenue_gap} = "€33,917" (how far revenue is BELOW target)`.
2. The model writes text such as "Revenue is {revenue_gap} below target…".
3. `narrative-guard.ts` rejects the text if it finds a digit outside a placeholder, an unknown placeholder, fewer than 3 figures or the wrong length. The model gets one retry, with the reasons.
4. On failure, timeout (15 s) or a second rejection, `scripted-narrative-writer.ts` takes over, and the answer's footer says "Scripted narrative (model unavailable)".
5. The model's style rules are in `prompts.ts`. Rule 10, for example, forbids linking the cancelled congress to future pace.

### 5.3 Morning briefing → investigation → decision
1. `GET /api/briefing` (`orchestrator/morning-briefing.ts`) gives at most 3 items, ranked by fixed rules (priority, deviation from the baseline, source). Each item carries the context of the investigation it opens.
2. A click on a briefing item, a chart point or a KPI card opens the `InvestigationPanel`. The panel has actions (`investigation-actions.ts`) that send a question to the chat together with a structured context (`investigation`).
3. Any insight can be saved (`SaveInsightButton`, `POST /api/decisions/insights`). Actions with a priority and a due date are created on it, and a completed action gets an outcome (`decision-service.ts`).
4. The chat also answers about decisions ("what decisions have I saved?", "what is overdue?") through the `get_decisions` tool.

### 5.4 Property Overview and answers about rooms
`GET /api/property` (`routes/property.ts`) returns:
- the rooms tonight: occupied, vacant, out of order, out of service
- the events (maintenance, group arrival, group cancellation), with their measured impact
- the previous completed month against target and last year

The chat answers "how many rooms are available?" through `get_property_status` and `get_room_events` (`property-answer.ts`). The answer includes a `navigate` action that opens the exact section of the page (`destination: 'property'`, `section: 'inventory' | 'events' | …`).

### 5.5 What-if
`POST /api/simulate` and the `simulate_scenario` tool (`packages/analytics/src/scenario.ts`) take `paceRecovery`, `rateChange` and `otaToDirect` for a stay period and compute the effect in euros.
- In the UI, the simulator is in `ExploreOverlay`: it opens from the pace card ("Expand · What-if"), with a callout and a one-time pop-up (`localStorage` key `aurora.hint.what-if-seen`).
- In the chat, "What if…" questions go through `what-if-answer.ts`.

**Authentication/authorization:** there is none for the UI and `/api/*` (see §8). Only `/mcp` needs a token.

---

## 6. API endpoints / external integrations

Everything is on the same origin. Errors look like `{ error: { code, message } }` (`http/json-response.ts`).

| Method | Endpoint | Purpose | Payload / parameters |
|---|---|---|---|
| GET | `/api/health` | Worker and database status | — |
| GET | `/api/workspace?hotel=` | hotels, period, starter questions written from the data, `today` | — |
| GET | `/api/briefing?hotel=` | morning briefing (≤ 3 items) | — |
| GET | `/api/property?hotel=` | Property Overview | — |
| POST | `/api/chat` | streamed SSE answer | `{ question, hotelId, conversationId, investigation? }` |
| GET | `/api/conversations?hotel=` | the Recent list | — |
| GET | `/api/conversations/:id` | the conversation with its stored events | — |
| PATCH | `/api/conversations/:id?hotel=` | rename | `{ title }` |
| DELETE | `/api/conversations/:id?hotel=` | delete (with its turns) | — |
| GET | `/api/decisions?hotel=` | insights, actions, outcomes | — |
| POST | `/api/decisions/insights` | save an insight (idempotent on `source_key`) | Zod insight (`packages/shared/src/decisions.ts`) |
| DELETE | `/api/decisions/insights/:id?hotel=` | delete, only when the insight has no actions | — |
| POST | `/api/decisions/actions` | create an action | Zod action |
| PATCH / DELETE | `/api/decisions/actions/:id?hotel=` | change / delete | the changed fields |
| POST | `/api/simulate` | what-if | `{ hotelId, stayFrom, stayTo, paceRecovery?, rateChange?, otaToDirect? }` |
| GET | `/api/hotels/:id/overview?from=&to=` | the overview tool as plain JSON | — |
| POST/GET | `/mcp` | MCP server (Streamable HTTP), the 10 tools | `Authorization: Bearer <MCP_TOKEN>`, 60/min |

The exact contracts (the source of truth) are the Zod schemas in `packages/shared/src/`, and the tools are in `tools/registry.ts`. The 10 tools are:
- `get_hotel_overview`, `query_performance`, `analyze_revenue_drivers`
- `get_channel_mix`, `get_booking_pace`, `get_group_blocks`
- `simulate_scenario`, `get_decisions`, `get_property_status`, `get_room_events`

**External integrations:** Cloudflare only (D1, Workers AI, Rate Limiting). There is no PMS, channel manager, email or payments. `[TO BE COMPLETED MANUALLY]`: the real data source (PMS/RMS) if the project goes beyond the demo.

---

## 7. Deployment & maintenance

- **Environments.** There is one deployed environment: env `ai`, Worker `aurora` (https://aurora.radulescuana111.workers.dev). The default environment (no AI) is only for local development. **There is no staging**: `[TO BE COMPLETED MANUALLY]` if one is needed (a new env in `wrangler.jsonc` with its own D1 database).
- **Branches.** Work happens directly on `main`: each step is tested, committed and pushed to GitHub, then deployed. There is no branch protection and no required PRs.
- **Release:**
  ```bash
  npm test && npm run typecheck
  npm run db:migrate:remote      # only when there are new migrations
  npm run deploy                 # web build (tsc + vite) + wrangler deploy --env ai
  ```
- **One-time setup** (already done): `wrangler login`, `wrangler d1 create aurora-db` (the id goes into `wrangler.jsonc` in **both** places), `wrangler secret put MCP_TOKEN --env ai`. The Cloudflare account belongs to the owner; `[TO BE COMPLETED MANUALLY]`: transfer it or invite the new developer to it.
- **Rotating the MCP token:** put the new value in `.secrets/production.env`, then run `npx wrangler secret put MCP_TOKEN --env ai`.
- **Logs:**
  - `npx wrangler tail --env ai` shows live logs (500 errors appear as `[Aurora] request failed`).
  - There are also Cloudflare Dashboard → Workers → aurora → Logs/Metrics, and D1 → aurora-db → Console for SQL queries.
  - Persistent observability (`observability` in wrangler) is **not** turned on.
- **Debugging in production:**
  - `GET /api/health` shows the Worker and database status.
  - `npx wrangler d1 execute aurora-db --remote --env ai --command "SELECT …"` runs queries directly on the production database.
  - If the model fails, the answer's footer says "Scripted narrative (model unavailable)".
- **Rollback:** `npx wrangler rollback --env ai` (the previous version of the Worker). D1 migrations have no automatic rollback.

---

## 8. Known issues, tech debt & next steps

### Known limitations (accepted for the demo)
- **No authentication and no multi-tenancy.** Anyone with the URL can read, create and delete conversations and decisions for any `hotel=`. Real users need auth (for example Cloudflare Access or OAuth) and a check that the user belongs to the hotel on every route.
- **Demo data, one hotel.** "Today" is fixed at 17 Nov 2026 (`DEMO_TODAY`), and the header shows "Demo data · today is 17 Nov 2026". Arrivals and departures are not in the data, and the UI says so.
- **No Performance page.** Those buttons open the chat (a product decision: "Not now").
- **MCP uses a shared token.** The next step is OAuth (see `docs/mcp-usage.md`).
- **Rate limit per `cf-connecting-ip`.** Without that header (locally) the key becomes `local`, so all local clients share one limit.
- **LLM quality.** Llama 3.3 sometimes picks the wrong tools or writes text that gets rejected. The fallback covers these cases, but the text then reads more like a template.

### Tech debt
- **Duplicated configuration.** `wrangler.jsonc` repeats D1, rate limits and vars for env `ai` (Wrangler does not inherit them). Every change has to be made in both places.
- **No CI.** Tests and typecheck only run by hand. Recommendation: a GitHub Action with `npm ci && npm run typecheck && npm test`, possibly with a deploy on push to `main` using a Cloudflare API token as a secret.
- **`dev:api` rebuilds the web app on every start,** and Wrangler sometimes loses the assets after a rebuild (404). Restarting fixes it; for UI work, Vite (`dev:web`) is better.
- **Windows.** `workerd` processes are sometimes left orphaned and keep ports 8787/8788 busy. Close them in Task Manager, or start on another port (see `AURORA_API_ORIGIN`).
- **The keyword planner** (`insight-plan.ts`) grew through rules added one after another (social → what-if → decisions → property → …). It is a refactoring candidate: declarative rules, with a test per rule.
- **`App.tsx` holds a lot of state** (conversation, panels, overlay, navigation; about 430 lines). A minimal router or a context per feature would simplify it.
- **The live database has test conversations** created during development. They can be deleted from the UI or with `DELETE FROM conversations WHERE …` on `--remote`.

### Immediate recommendations for the next developer
1. Run `npm install`, `npm run db:migrate:local`, `npm test` and `npm run dev`. Then go through the starter questions in the UI with `docs/architecture.md` open.
2. Read in this order: `packages/shared/src/tools.ts`, `worker/src/tools/registry.ts`, `worker/src/orchestrator/run-insight.ts`, `web/src/stream/run-reducer.ts`.
3. Add CI (see Tech debt).
4. Before any real user: authentication and per-hotel authorization, a staging environment with its own D1, observability turned on.
5. Conventions to keep: code and names in English, descriptive; Sass, not Tailwind; no figure written by the LLM; every new contract in `packages/shared` with Zod; tests for every new tool and rule.
