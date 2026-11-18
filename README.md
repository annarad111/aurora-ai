# Aurora

AI-first revenue assistant for hotel revenue managers. Independent concept for the Juyo assessment.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
npm test         # Vitest for packages/shared and packages/analytics
npm run typecheck
```

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
docs/
  design/design_handoff_aurora_ai_chat/   design reference (open Aurora v2.dc.html in a browser)
  implementation-plan.md                  the step-by-step plan and what to check after each step
web/
  index.html
  src/
    main.tsx                    entry: mounts <App> inside <ThemeProvider>, imports styles/main.scss
    app/
      App.tsx                   the three-column workspace
      workspace-content.ts      static demo content (property, suggestions, recent questions)
      layout/                   Sidebar, ThemeSwitch, ConversationHeader, EvidencePanel
    features/
      conversation/             Composer, run-phase (idle / streaming / done / cancelled)
      empty-state/              SuggestedQuestions (idle screen)
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
