# Aurora

AI-first revenue assistant for hotel revenue managers. Independent concept for the Juyo assessment.

## Run it

First time only:

```bash
npm install
npm run db:migrate:local   # creates the local D1 database (.wrangler/) with the schema and the demo data
```

Every day:

```bash
npm run dev          # Worker on :8787 + React app on :5173 (open http://localhost:5173), templates only, offline
npm run dev:ai       # same, with Workers AI writing the text (run `npx wrangler login` once first)
npm run dev:api      # only the Worker (it also serves the built React app on http://localhost:8787)
npm test             # Vitest for all packages
npm run typecheck
npm run build        # production build of the React app
npm run tools:demo             # run the 4 tools on the demo data, print the key numbers
npm run tools:demo -- --json   # same, full JSON output
npm run db:seed:generate       # rewrite worker/migrations/0002_seed.sql after changing packages/demo-data
```

Try the stream by hand while `npm run dev:api` runs:

```bash
curl -N -X POST http://localhost:8787/api/chat \
  -H "content-type: application/json" \
  -d '{"question":"Why is my hotel revenue below target this month?","hotelId":"sablon-bru"}'
```

## How the language model is used

The model never computes or types a number.

1. **Planning.** The model sees the four tools (function calling) and picks the ones the question needs.
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

| Route | What it does |
|---|---|
| `POST /api/chat` | `{ question, hotelId }` → Server-Sent Events: `run_started`, `step`, `kpi`, `chart`, `insight`, `text_delta`, `provenance`, `followups`, `done` (or `error`) |
| `GET /api/hotels/:id/overview?from=&to=` | The overview tool as plain JSON, no AI. Defaults to month to date. |
| `GET /api/health` | Worker and database status |

## Where things are

```
packages/
  shared/src/                   contracts used by both worker and web (Zod schemas + inferred types)
    domain.ts                   hotels, daily_stats, targets, channels, on_the_books
    metric-meta.ts              per-KPI direction (higher/lower is better) and status thresholds
    findings.ts                 a fact with its euro impact; the only input for the narrative
    tools.ts                    input/output of the 4 MCP tools
    stream-events.ts            the SSE events of POST /api/chat
    format.ts                   €, %, pp and counts, written the same way everywhere
  analytics/src/                pure, deterministic maths (no HTTP, no LLM, no React)
    kpi.ts                      occupancy, ADR, RevPAR, Net RevPAR, pickup
    variance.ts                 revenue gap = volume + mix + pure price (exact)
    channels.ts                 channel mix, commission cost, cost of the mix shift
    pace.ts                     on the books vs last year
    status.ts                   on track / watch / off track from direction + thresholds
    findings.ts                 analysis results -> findings ranked by euro impact
    aggregate.ts, dates.ts      grouping daily rows, inclusive date ranges
  demo-data/src/                deterministic demo dataset (fixed seed, fixed "today" = 17 Nov 2026)
    story.ts                    THE PLANTED STORY: every number the demo is built around
    generate-demo-dataset.ts    turns the story into daily_stats, targets and on_the_books rows
    allocate.ts                 splits whole numbers without losing any (largest remainder, matrix fitting)
wrangler.jsonc                  one Worker: static assets + D1 + vars (demo "today", stream pacing)
worker/
  migrations/                   0001_schema.sql (5 tables), 0002_seed.sql (generated, committed)
  src/
    index.ts                    Worker entry: builds the real dependencies (D1, assets)
    app.ts                      router: /api/chat, /api/hotels/:id/overview, /api/health, else assets
    env.ts                      bindings and the checked config
    routes/                     one file per route
    db/                         HotelDataRepository interface, D1 implementation (the only SQL), in-memory implementation
    tools/                      the 4 tools + registry.ts (one source for chat and MCP)
    sse/sse-event-stream.ts     validated, numbered SSE events, heartbeat, stop on disconnect
    orchestrator/
      run-insight.ts            the run: steps → tools → KPI/charts → insight → text → provenance → follow-ups → done
      insight-plan.ts           keyword rules, and turning the model's tool choice into a plan
      insight-planners.ts       KeywordInsightPlanner, LanguageModelInsightPlanner (with fallback)
      scripted-narrative-writer.ts  the words around the numbers, from templates
      language-model-narrative-writer.ts  the model writes the explanation; guard, retry, fallback
      figure-catalogue.ts       the placeholders the model may use, with their exact values
      narrative-guard.ts        rejects digits outside placeholders; fills in the values
      prompts.ts                Aurora's instructions to the model
    llm/                        LanguageModel interface, Workers AI implementation
      provenance.ts             "How was this calculated?" for every fact id
      context-notes.ts          the sentence of the contextual insight card, from the same tool output
      tool-events.ts            KPI cards and chart payloads sent after each tool
  scripts/                      tools:demo and the seed SQL generator (run with tsx)
docs/
  design/design_handoff_aurora_ai_chat/   design reference (open Aurora v2.dc.html in a browser)
  implementation-plan.md                  the step-by-step plan and what to check after each step
web/
  index.html
  src/
    main.tsx                    entry: mounts <App> inside <ThemeProvider>, imports styles/main.scss
    app/
      App.tsx                   the three-column workspace; owns the run and the hover/selection state
      workspace-content.ts      static demo content (property, suggestions, recent questions)
      layout/                   Sidebar, ThemeSwitch, ConversationHeader, EvidencePanel
    stream/
      parse-sse.ts              response body -> validated stream events (fetch + ReadableStream)
      run-reducer.ts            pure reducer: events + Start/Stop/Reset -> the answer on screen
      useInsightRun.ts          hook: start, stop (AbortController), retry, reset
    features/
      conversation/             AnswerView, RunTimeline, StreamedExplanation, RunBanner, FollowUps, Composer
      insights/                 MainFinding, KpiCard, ContextualInsightCard, fact-links (which elements light up
                                together), context-followups (questions that change with the selected figure)
      evidence/                 RevenueBridgeCard / RevenueBridgeChart (+ revenue-bridge-geometry, tested),
                                ChannelMixCard, BookingPaceCard, ProvenanceCard ("How was this calculated?")
      explore/                  ExploreOverlay (dialog, Esc, focus kept inside) with four views:
                                Occupancy (layer toggles, tooltips), Bridge (segment drill-down, formula of
                                the selected bar), Channel (months + last year, stat tiles), Pace (per stay date)
      empty-state/              SuggestedQuestions (idle screen)
    lib/                        metric-display (value, delta, status icon), class-names
    design-system/
      ThemeProvider.tsx         light / dark / system, saved in localStorage
      icons.tsx                 inline SVG icons
    styles/                     Sass, no Tailwind (see below)
```

## Styling

Plain Sass (SCSS), with BEM class names (`.block__element--modifier`).

| Folder | What it holds |
|---|---|
| `styles/themes/_palette.scss` | Light and dark colour maps. **Change a colour here.** |
| `styles/themes/_theme-variables.scss` | Turns the maps into CSS variables (`--color-petrol`, ...) and defines semantic aliases (`--color-ai`, `--color-status-off-track`, ...). |
| `styles/abstracts/_variables.scss` | Spacing, type scale, radii, shadows, motion, layout widths. |
| `styles/abstracts/_mixins.scss` | `eyebrow`, `unstyled-button`, `focus-visible-ring`, `tabular-numbers`, `below-breakpoint`. |
| `styles/base/` | Reset, body typography, shared keyframes. |
| `styles/layout/_workspace.scss` | The three-column layout and how it stacks on narrow screens. |
| `styles/components/` | One partial per component, named like the component. |

Colours are CSS variables, so the theme switches at runtime without reloading.
Everything else is a Sass variable and is resolved at build time.
