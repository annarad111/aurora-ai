import type { ToolName } from '@aurora/shared';

// ---------------------------------------------------------------------------
// Deciding which tools a question needs.
//
// Step 4 uses simple keyword rules (the "scripted" planner). In step 8 the
// language model chooses tools through tool calling, and these rules stay as
// the fallback when the model is unavailable.
// ---------------------------------------------------------------------------

export type InsightIntent = 'revenue_gap' | 'channel_cost' | 'booking_pace' | 'segment_shift';

export interface RunStepPlan {
  stepId: string;
  /** Shown in the run timeline. Says what Aurora is doing, not which function runs. */
  label: string;
  tool: ToolName;
}

export interface InsightPlan {
  intent: InsightIntent;
  steps: RunStepPlan[];
}

const STEP_FOR_TOOL: Record<ToolName, RunStepPlan> = {
  get_hotel_overview: { stepId: 'overview', label: 'Checking occupancy and rate', tool: 'get_hotel_overview' },
  analyze_revenue_drivers: { stepId: 'drivers', label: 'Decomposing the revenue gap', tool: 'analyze_revenue_drivers' },
  get_channel_mix: { stepId: 'channels', label: 'Comparing channels', tool: 'get_channel_mix' },
  get_booking_pace: { stepId: 'pace', label: 'Checking pace for the rest of the month', tool: 'get_booking_pace' },
};

const TOOLS_FOR_INTENT: Record<InsightIntent, ToolName[]> = {
  revenue_gap: ['get_hotel_overview', 'analyze_revenue_drivers', 'get_channel_mix', 'get_booking_pace'],
  channel_cost: ['get_hotel_overview', 'get_channel_mix'],
  booking_pace: ['get_hotel_overview', 'get_booking_pace'],
  segment_shift: ['get_hotel_overview', 'analyze_revenue_drivers'],
};

/** Checked in order. The first match wins; anything else is a revenue-gap question. */
const INTENT_KEYWORDS: Array<{ intent: InsightIntent; pattern: RegExp }> = [
  { intent: 'channel_cost', pattern: /\b(ota|otas|commissions?|channels?|distribution|direct|booking\.com|expedia)\b/i },
  { intent: 'booking_pace', pattern: /\b(pace|pick-?up|on the books|otb|forecast|rest of the month|(last|next) \d+ days)\b/i },
  { intent: 'segment_shift', pattern: /\b(segments?|corporate|leisure|mice|groups?|congress)\b/i },
];

export function detectIntent(question: string): InsightIntent {
  return INTENT_KEYWORDS.find((rule) => rule.pattern.test(question))?.intent ?? 'revenue_gap';
}

export function planInsightRun(question: string): InsightPlan {
  const intent = detectIntent(question);
  return { intent, steps: TOOLS_FOR_INTENT[intent].map((tool) => STEP_FOR_TOOL[tool]) };
}
