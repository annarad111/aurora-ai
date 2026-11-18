# UX rationale and validation plan

> **Status: plan only.** No user test has been run. Nothing below reports results.

## The question

Revenue managers today read dense dashboards and work out the "why" themselves. Aurora's hypothesis is
that an answer-first layout (main finding → KPIs → explanation with clickable, explainable figures →
supporting charts) gets them to the right cause faster and with more confidence, without hiding the data.

## Design choices and the reasoning behind them

| Choice | Rationale |
|---|---|
| Main finding before the numbers | Executive summary first; details on demand |
| One strongly coloured block | Keeps a visual hierarchy; if every card is red, nothing stands out |
| Status = colour + icon + text | About 1 in 12 men has a colour vision deficiency, red/green is the hardest pair |
| Polarity-aware status | "Up" is not always good (cancellations, OTA share) |
| Clickable figures with provenance | Trust in AI output: every number shows its tool, formula and inputs |
| Progressive streaming with named steps | The user sees what the system is doing instead of waiting on a spinner |
| Charts in a side panel, expandable | Charts support the conversation instead of being a permanent dashboard |

## Hypotheses and metrics

| Metric | How it is measured | Hypothesis (Aurora vs a dense KPI grid) |
|---|---|---|
| Time to insight | Seconds until the first click on the correct driver | Lower |
| Interpretation accuracy | % of participants who name the main cause correctly | Higher |
| Task completion | % who reach a conclusion within 2 minutes | Higher |
| Perceived cognitive load | Single Ease Question (1–7) or short NASA-TLX | Lower |
| Confidence | Likert 1–7: "How sure are you of your conclusion?" | Higher |

## Method

- Within-subjects test with 5–8 revenue managers.
- Two variants of the same data: Aurora, and a baseline that shows the same KPIs as a uniform grid with no
  hierarchy and no narrative. The order of the variants alternates between participants.
- Task: "Revenue is below target this month. Find out why, and what to watch for the rest of the month."
- Planted ground truth (from the demo data): the cancelled MICE block (volume), the shift to leisure (mix),
  the OTA shift (net vs gross revenue), and the weak pace for 21–30 November.

## Not built yet

The baseline variant (`?view=dense`) was the first item on the cut list and is not implemented. It would
render the same run state as a uniform eight-card KPI grid without the main finding or narrative, so the
two variants can be compared side by side with identical data.
