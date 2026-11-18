# Cognitive Clarity: Aurora's design system

The design handoff is in `docs/design/design_handoff_aurora_ai_chat/`. This page explains how it is
implemented and how to change it.

## Principles

1. **The summary before the details.** The main finding arrives first; KPIs, text and charts follow.
2. **One accent per screen.** The main finding (violet) is the only strongly coloured block. KPI cards stay calm.
3. **Colour is never the only signal.** Every status has a colour, an icon (↑ ↓ !) and a text label
   (visible, or for screen readers).
4. **Every number can be explained.** Every figure links to its tool, formula, inputs and source.

## Colour semantics

| Token | Meaning |
|---|---|
| `--color-petrol` (`--color-primary`) | Primary action and data |
| `--color-violet` (`--color-ai`) | Aurora's own voice: the main finding, the run timeline, focus rings |
| `--color-sage` (`--color-status-on-track`) | On track |
| `--color-amber` (`--color-status-watch`) | Watch |
| `--color-coral` (`--color-status-off-track`) | Off track |

## Status comes from the data, not the UI

`packages/analytics/src/status.ts` computes `on_track / watch / off_track` from the metric's direction
(`higher_is_better` / `lower_is_better` in `packages/shared/src/metric-meta.ts`) and two thresholds.
A rising cancellation rate is therefore bad news, not green. The same status reaches the chat, the
evidence panel and MCP clients; the UI only colours it.

## Where the styles live (Sass, no Tailwind)

```
web/src/styles/
  main.scss                  the only entry point; lists every partial in screen order
  themes/_palette.scss       light and dark colour maps — change a colour here
  themes/_theme-variables.scss  maps → CSS variables (--color-*), semantic aliases, fonts, focus ring
  abstracts/_variables.scss  spacing, type scale, radii, shadows, motion, layout widths, breakpoint
  abstracts/_mixins.scss     eyebrow, unstyled-button, focus-visible-ring, tabular-numbers, enters-on-arrival
  base/                      reset, body typography, keyframes, utilities (.visually-hidden)
  layout/_workspace.scss     three columns; stacked below 900 px
  components/                one partial per component, BEM names (.kpi-card__value, .run-status--done)
```

- **Colours are CSS variables**, so Light / Dark / System switch at runtime. `ThemeProvider.tsx` writes
  `data-theme` on `<html>`; a small script in `index.html` applies the saved theme before the first paint.
- **Everything else is a Sass variable**, resolved at build time.
- **Charts are plain HTML/CSS**, not a chart library: bars are absolutely positioned elements whose height
  comes from the data, so they inherit the theme and animate with CSS transitions.

## Recipes

- *Change the primary colour:* edit `'petrol'` in both maps in `_palette.scss`.
- *Change what "on track" looks like:* change `--color-status-on-track` in `_theme-variables.scss`.
- *Add a component:* create `components/_my-component.scss`, start it with `@use '../abstracts' as *;`,
  and add `@use 'components/my-component';` to `main.scss`.
- *Change the mobile breakpoint:* `$breakpoint-stacked` in `_variables.scss`.

## Accessibility

- Status: icon + text + colour; visually hidden labels on badges and chips.
- `aria-live="polite"` on the run timeline (announces step changes) and on the explanation; the timeline
  announces steps, not every word.
- `aria-pressed` on chips, figures and toggles; the Explore overlay is `role="dialog" aria-modal="true"`,
  keeps focus inside and returns it to the opener; Esc closes it.
- Visible focus ring on every interactive element; `prefers-reduced-motion` turns animations off.
- Numbers use `tabular-nums` so columns line up.
