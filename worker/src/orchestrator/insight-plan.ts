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

/** The tools the templates of an intent cannot do without. */
const REQUIRED_TOOLS_FOR_INTENT: Record<InsightIntent, ToolName[]> = {
  revenue_gap: ['get_hotel_overview', 'analyze_revenue_drivers'],
  channel_cost: ['get_hotel_overview', 'get_channel_mix'],
  booking_pace: ['get_hotel_overview', 'get_booking_pace'],
  segment_shift: ['get_hotel_overview', 'analyze_revenue_drivers'],
};

/** The order tools run in, whatever order the model listed them. Overview first: it feeds the KPI cards. */
const TOOL_ORDER: ToolName[] = ['get_hotel_overview', 'analyze_revenue_drivers', 'get_channel_mix', 'get_booking_pace'];

/**
 * Turns the tools a language model chose into a plan.
 * The intent follows from the choice (only channels → channel_cost, only
 * pace → booking_pace, only drivers → segment_shift, else revenue_gap), and
 * the tools that intent needs are added, so the answer can always be written.
 */
export function planFromToolNames(chosenTools: ToolName[]): InsightPlan {
  const chosen = new Set(chosenTools);
  const usesDrivers = chosen.has('analyze_revenue_drivers');
  const usesChannels = chosen.has('get_channel_mix');
  const usesPace = chosen.has('get_booking_pace');

  let intent: InsightIntent = 'revenue_gap';
  if (usesChannels && !usesDrivers && !usesPace) intent = 'channel_cost';
  else if (usesPace && !usesDrivers && !usesChannels) intent = 'booking_pace';
  else if (usesDrivers && !usesChannels && !usesPace) intent = 'segment_shift';

  const tools = new Set<ToolName>([...chosen, ...REQUIRED_TOOLS_FOR_INTENT[intent]]);
  return { intent, steps: TOOL_ORDER.filter((tool) => tools.has(tool)).map((tool) => STEP_FOR_TOOL[tool]) };
}
