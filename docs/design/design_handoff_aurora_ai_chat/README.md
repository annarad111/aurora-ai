# Handoff: Aurora — AI-first revenue assistant (hospitality)

## Overview
Aurora is an AI chat interface for hotel revenue managers. The user asks a question ("Why is my hotel revenue below target this month?"). Aurora calls four read-only MCP tools, then streams one answer made of: run steps, a main finding, KPI cards, a written explanation with clickable figures, and a contextual evidence panel (revenue bridge, channel mix, booking pace). The design is AI-first: charts support the conversation, there is no permanent dashboard.

Key product ideas, in priority order:
1. **Progressive AI rendering**: each part of the answer appears as soon as its data is available.
2. **Conversational data exploration**: every figure in the AI text is clickable, highlights the related KPI and chart bar, and opens a contextual insight card.
3. **Expandable analytics**: compact charts in the side panel expand into an overlay with filters, tooltips and drill-down.
4. **Explainable AI / data provenance**: every number opens "How was this calculated?" (tool, formula, inputs, source query).
5. **Context-aware follow-ups**: suggested questions change based on the selected metric.

## About the design files
`Aurora v2.dc.html` is a **design reference built in HTML**, a prototype showing the intended look and behavior. It is not production code. Recreate it in the target codebase's environment (e.g. React + the existing styling approach). If there is no codebase yet, React + TypeScript with CSS variables for theming is a good fit. Open the HTML file in a browser (keep `support.js` next to it) to see it running. The logic lives in the `<script data-dc-script>` block at the bottom: all data constants, the streaming timeline in `start()`, and derived view state in `renderVals()`.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and interactions are final. Data values are demo placeholders (see "Data" below).

## Layout
Three columns, full viewport height, flex with wrap:
- **Sidebar**: `flex: 0 0 248px`, sticky, `padding 20px 16px`, right border, surface background.
- **Conversation**: `flex: 1 1 520px`, column; header (14px 28px padding, bottom border), scrolling body with content column `max-width 760px`, centered, `padding 32px 28px 40px`, `gap 20px`; fixed composer at the bottom.
- **Evidence panel**: `flex: 1 1 340px; max-width 440px`, scrolls, left border, `padding 20px`, `gap 14px`.
- **Explore overlay**: fixed, full-screen scrim `rgba(17,26,39,.45)`, dialog `max-width 900px`, radius 18px, padding 24px 26px, shadow `0 24px 60px rgba(17,26,39,.25)`.

## Screens / components

### Sidebar
- Logo: 26px circle with 2px violet border, 10px petrol dot inside; "Aurora" 18px/600.
- Subline 12px ink3.
- "New analysis" button: 40px tall, radius 10px, 1px line border, hover border petrol. Resets to idle.
- Property card: sunken background, radius 10px. "Hotel Sablon" 600, "Brussels · 111 rooms · EUR" 12px ink2.
- Recent list: buttons with 13px question + 11px date; hover sunken. Click re-runs that question.
- MCP status: dashed border, sage dot, mono `/mcp` · 4 read-only tools.
- Theme switch: segmented Light / Dark / System (3 columns, 30px buttons, active = surface bg + subtle shadow). System follows `prefers-color-scheme` live.

### Conversation header
"Revenue workspace" (600) + pill "1–17 Nov 2026 · month to date". Right side: status dot + label. Ready (ink3), Analysing (violet), Answer verified (sage), Stopped (amber).

### Idle state
H1 30px/600 "What do you want to understand about Hotel Sablon?", 1-line description, grid of 4 suggestion cards (`minmax(240px,1fr)`, radius 12px, eyebrow tag 11px uppercase petrol). Click starts a run.

### Answer, top to bottom
1. **User bubble**: right aligned, ink background, bg-colored text, radius `14px 14px 4px 14px`.
2. **Run steps** (collapsible card, radius 12px): header "Aurora" + live summary ("Decomposing the revenue gap…", later "4 steps · 4.1 s · 4 tools"). Rows: status icon (pending ring / pulsing violet dot / sage check / dash for stopped), label 13px, tool name mono 11px. Auto-collapses when done. `aria-live="polite"`.
3. **Main finding** (only strongly colored element): violet-soft bg, 1px violet border, radius 16px, padding 20px 22px. Eyebrow "MAIN FINDING", delta pill "↓ −€33,917 vs target" (coral). Headline 21px/600. Below: "Select an insight to investigate:" + 3 pill chips (34px, violet border, colored dot: coral/sage/amber). Selected chip = filled violet-ink. Plus underlined link "How was this calculated?".
4. **KPI cards**: grid `minmax(160px,1fr)`, radius 12px, padding 14px. Label 12px ink2, value 24px/600 tabular, delta badge (status colour + icon ↓ ↑ !, never colour alone), reference 11px ink3. Hover/selection = 2px violet ring.
5. **Explanation**: 15px / 1.75, streamed word by word with blinking violet caret. Figures are inline buttons: petrol-soft bg, dashed petrol underline, 600 weight; violet-soft when active.
6. **Contextual insight card** (when a figure, chip or KPI is selected): 1px petrol border, radius 14px. Eyebrow "CONTEXTUAL INSIGHT" + label pill, 15px text, primary button "Explore this insight →" (petrol, opens overlay) and secondary "How was this calculated?" (opens provenance). Dismiss ×.
7. **Cancelled banner** (after Stop): amber-soft, "Stopped. Everything received so far is kept." + "Run again".
8. **Follow-ups**: label "Suggested next" or "Suggested next, based on {metric}", pill buttons; meta line "Answered in X s · Workers AI · 10 figures matched to tool output".

### Composer
Max 760px, radius 14px, 40px input (max 280 chars), petrol send button 40×40. While streaming: input disabled, button becomes "■ Stop".

### Evidence panel
- Empty state: dashed card "Evidence panel".
- **Provenance card** (replaces charts when open): eyebrow "HOW WAS THIS CALCULATED?", title, value 30px/600, tool chip (mono, petrol-soft), formula block (mono 12.5px, sunken), inputs table, source query (mono 11.5px), footnote "Computed deterministically in packages/analytics. The language model only writes the sentence around it."
- **Revenue bridge**: waterfall, 5 bars (Target / Volume / Mix / Price / Actual), 210px tall, y-axis starts at €160k (note shown). Bars animate height/bottom 700ms `cubic-bezier(.2,.7,.2,1)`. Each bar clickable and ring-highlighted when related figure is hovered/selected. "Expand" button.
- **Channel mix**: two stacked 22px bars (This month vs Last year), 4 channels, legend, link "Commission cost: €22,492 (10.8% of revenue)". "Expand".
- **Pace 21–30 Nov**: amber "! Watch" badge, two horizontal bars (612 on books vs 731 LY), link. "Expand".

### Explore overlay (4 views)
Header: eyebrow "EXPLORE · FROM AURORA'S ANSWER", title 22px/600, subtitle, close. Esc / scrim click closes. Footer always shows context-aware follow-ups.
- **occ**: daily occupancy 1–17 Nov, 17 bars 260px, toggle pills: Target 75% (dashed line), Last year (violet tick per day), Cancelled congress (coral bars + coral day labels for 10–12 Nov). Hover dims other bars to .55 and shows dark tooltip (date, occupancy, LY, "Congress block cancelled").
- **bridge**: larger waterfall + "Volume effect by segment" diverging bars (MICE −34.9k, Corporate −9.1k, Groups −2.3k, Leisure +4.4k).
- **channel**: stacked rows Sep / Oct / Nov 1–17 (bold) / Nov 2025 with commission % column + 3 stat tiles.
- **pace**: 10 stay dates, paired bars (OTB petrol vs LY line colour), tooltip with difference.

## Interactions & behavior
- **Streaming timeline** (ms at speed 1): 250 step 1 running · 1000 step 2 + 2 KPIs · 1400 4 KPIs · 2100 main finding + bridge · 2800 channel mix · 3400 pace · from 3500 text tokens every 36 ms · end +250 follow-ups, phase done, steps collapse. In production this order is driven by real tool results / SSE events, not timers.
- **Linked highlighting**: `active = hovered ?? focus`. Related map: mice→volume bar, adr→price bar, gap→target+actual, ota/netrevpar→channel card, pace→pace card. Ring = `0 0 0 2px violet`.
- Click on figure/chip/KPI/bar → `focus = id` (contextual card + follow-ups change). "How was this calculated?" → `selected = id` (provenance in panel).
- Each focus id maps to an overlay view: mice/occ/revpar→occ, volume/adr/price/mix/gap→bridge, ota/netrevpar→channel, pace→pace.
- Stop keeps partial output; pending/running steps become "stopped".
- Entry animation for new blocks: `aurIn` 6px translateY + fade, 250–400ms ease-out.
- Accessibility: status always icon + text + colour; `aria-live` on steps and text; `aria-pressed` on toggles/chips; dialog `aria-modal`.

## State
`phase` (idle | streaming | done | cancelled), `question`, `draft`, `steps[]` (status), `kpiN`, flags `insight/bridge/mix/pace`, `tok` (streamed token count), `follow`, `hovered`, `focus`, `selected`, `overlay` (null | occ | bridge | channel | pace), `ovHover`, `showTarget/showLY/showBlock`, `theme` (light | dark | system), `tlOpen`.

## Design tokens (Cognitive Clarity palette)
| token | light | dark |
|---|---|---|
| --bg | #F7F9FC | #111A27 |
| --surface | #FFFFFF | #172334 |
| --sunken | #EEF2F7 | #1F2C40 |
| --line | #E2E7EE | #2A3851 |
| --ink | #172334 | #E9EEF5 |
| --ink2 | #46526A | #B7C1CF |
| --ink3 | #5F6B7C | #97A3B5 |
| --petrol | #267D91 | #7CCFDC |
| --petrol-soft | #E4F0F3 | #183843 |
| --violet | #7663C5 | #A797EC |
| --violet-ink | #5B48A8 | #C6BCF6 |
| --violet-soft | #F0EDFA | #262645 |
| --sage | #2C7A64 | #6FCBA8 |
| --sage-soft | #E4F1EC | #173832 |
| --amber | #B77922 | #E7B567 |
| --amber-ink | #8A5A14 | #E7B567 |
| --amber-soft | #F8EFE1 | #3A2F1E |
| --coral | #B4463A | #F29384 |
| --coral-soft | #F8E7E4 | #3F2529 |

Semantics: petrol = primary/action/data, violet = AI, sage = on track, amber = watch, coral = off track (added; palette has no red).
- **Type**: Geist 400/500/600 (UI), Geist Mono 400/500 (tools, formulas). Scale: 11 / 12 / 13 / 14 (base, lh 1.5) / 15 (answer, lh 1.75) / 16 / 18 / 21 / 22 / 24 / 30. Numbers use `tabular-nums`. Eyebrows 11px/600 uppercase, letter-spacing .06–.08em.
- **Radii**: 4–6 (bars, badges), 7–10 (buttons), 12 (cards), 14 (panels, composer), 16 (main finding), 18 (overlay), 999 (pills).
- **Spacing**: 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 32.
- **Shadows**: composer `0 1px 2px rgba(23,35,52,.06)`; overlay as above; focus ring `0 0 0 2px var(--violet)`.

## Data
Demo numbers (Hotel Sablon, 1–17 Nov 2026): room revenue €208,260 vs target €242,177 (gap −€33,917); occupancy 62.0% vs 75%; ADR €178 vs €171.15; RevPAR €110.36; Net RevPAR €98.44; volume −€41,932, mix −€6,240, price +€14,255; OTA 48% vs 35% LY; pace 612 vs 731. Daily occupancy, segment drill-down, monthly commissions and per-day pace are placeholders. All must come from the analytics package / MCP tools (`get_hotel_overview`, `analyze_revenue_drivers`, `get_channel_mix`, `get_booking_pace`). Every figure shown in AI text must be matched to tool output (the provenance card relies on this).

## Assets
No images. Icons are small inline SVG strokes (plus, close, send arrow, check, expand, arrow right), 1.5–1.8 stroke. Fonts from Google Fonts.

## Files
- `Aurora v2.dc.html`: the full prototype (template + logic + data).
- `support.js`: runtime needed only to open the prototype in a browser.
