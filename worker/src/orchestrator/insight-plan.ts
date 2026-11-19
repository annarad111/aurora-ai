import {
  BREAKDOWN_DIMENSION_LABELS,
  BREAKDOWN_METRIC_INFO,
  type BreakdownMetric,
  type DateRange,
  type InvestigationContext,
  type MetricId,
  queryPerformanceInputSchema,
  type IsoDate,
  type QueryPerformanceInput,
  type ToolName,
} from '@aurora/shared';
import { isAboutPace, isAboutTheTargetGap, parseDataQuestion, parseGroupBlockQuestion, parsePeriod } from './question-parser';

// ---------------------------------------------------------------------------
// Deciding which tools a question needs.
//
// Analyses (fixed sets of tools, rich templated answers):
//   revenue_gap, channel_cost, booking_pace, segment_shift
// Data questions (one tool call with arguments, generic answer):
//   data_question  query_performance   "ADR on weekends by channel"
//   group_blocks   get_group_blocks    "Are other group blocks at risk this quarter?"
//
// The keyword rules here work without a model. With the model on, it chooses
// the tools and arguments itself, and these rules are the fallback.
// ---------------------------------------------------------------------------

export type { InsightIntent } from '@aurora/shared';
import type { InsightIntent } from '@aurora/shared';

export interface RunStepPlan {
  stepId: string;
  /** Shown in the run timeline. Says what Aurora is doing, not which function runs. */
  label: string;
  tool: ToolName;
  /** Tool input for data questions (without hotelId). Analyses build their input from the period. */
  input?: Record<string, unknown>;
}

export interface DataQuestionFocus {
  primaryMetric: BreakdownMetric;
  rankBy: 'value' | 'change';
}

export interface InsightPlan {
  intent: InsightIntent;
  steps: RunStepPlan[];
  /** A period other than month to date ("why was revenue below target in October?"). */
  periodOverride?: DateRange;
  /** Future stay dates other than the default pace window. */
  paceWindowOverride?: DateRange;
  /** For data questions: which metric the answer leads with, and how rows are ranked. */
  dataFocus?: DataQuestionFocus;
}

const STEP_FOR_TOOL: Record<'get_hotel_overview' | 'analyze_revenue_drivers' | 'get_channel_mix' | 'get_booking_pace', RunStepPlan> = {
  get_hotel_overview: { stepId: 'overview', label: 'Looking at occupancy and rates', tool: 'get_hotel_overview' },
  analyze_revenue_drivers: { stepId: 'drivers', label: 'Finding what is behind the gap', tool: 'analyze_revenue_drivers' },
  get_channel_mix: { stepId: 'channels', label: 'Comparing channels', tool: 'get_channel_mix' },
  get_booking_pace: { stepId: 'pace', label: 'Checking bookings for the coming nights', tool: 'get_booking_pace' },
};
type AnalysisToolName = keyof typeof STEP_FOR_TOOL;

const TOOLS_FOR_INTENT: Record<'revenue_gap' | 'channel_cost' | 'booking_pace' | 'segment_shift', AnalysisToolName[]> = {
  revenue_gap: ['get_hotel_overview', 'analyze_revenue_drivers', 'get_channel_mix', 'get_booking_pace'],
  channel_cost: ['get_hotel_overview', 'get_channel_mix'],
  booking_pace: ['get_hotel_overview', 'get_booking_pace'],
  segment_shift: ['get_hotel_overview', 'analyze_revenue_drivers'],
};

/** Checked in order. The first match wins; anything else is a revenue-gap question. */
const INTENT_KEYWORDS: Array<{ intent: keyof typeof TOOLS_FOR_INTENT; pattern: RegExp }> = [
  { intent: 'channel_cost', pattern: /\b(ota|otas|commissions?|channels?|distribution|direct|booking\.com|expedia)\b/i },
  { intent: 'booking_pace', pattern: /\b(pace|pick-?up|on the books|otb|forecast|rest of the month|(last|next) \d+ days)\b/i },
  { intent: 'segment_shift', pattern: /\b(segments?|corporate|leisure|mice|groups?|congress)\b/i },
];

export function detectIntent(question: string): keyof typeof TOOLS_FOR_INTENT {
  return INTENT_KEYWORDS.find((rule) => rule.pattern.test(question))?.intent ?? 'revenue_gap';
}

export function analysisPlan(intent: keyof typeof TOOLS_FOR_INTENT): InsightPlan {
  return { intent, steps: TOOLS_FOR_INTENT[intent].map((tool) => STEP_FOR_TOOL[tool]) };
}

/** "Looking up ADR by channel" — what the timeline shows for a data question. */
export function describeQueryStep(input: Omit<QueryPerformanceInput, 'hotelId'>, primaryMetric: BreakdownMetric): string {
  const metricLabel = BREAKDOWN_METRIC_INFO[primaryMetric].label;
  const split = input.groupBy === 'none' ? '' : ` ${BREAKDOWN_DIMENSION_LABELS[input.groupBy]}`;
  return `Looking up ${metricLabel}${split}${input.compareWithLastYear ? ' vs last year' : ''}`;
}

export function dataQuestionPlan(query: Omit<QueryPerformanceInput, 'hotelId'>, dataFocus: DataQuestionFocus): InsightPlan {
  return {
    intent: 'data_question',
    steps: [{ stepId: 'query', label: describeQueryStep(query, dataFocus.primaryMetric), tool: 'query_performance', input: query }],
    dataFocus,
  };
}

export function groupBlocksPlan(period: DateRange): InsightPlan {
  return { intent: 'group_blocks', steps: [{ stepId: 'blocks', label: 'Checking group blocks', tool: 'get_group_blocks', input: { period } }] };
}

/**
 * Keyword planning, in this order:
 *   1. about the gap vs target ("why", "target", "lost")   → the existing analyses
 *   2. about pace, or about future nights                    → booking_pace
 *   3. about group blocks / congresses / events              → group_blocks
 *   4. a data question (a split, a period or weekend/weekday) → data_question
 *   5. anything else                                          → the existing analyses by keyword
 */
export function planInsightRun(question: string, today: IsoDate): InsightPlan {
  if (isAboutTheTargetGap(question)) {
    const period = parsePeriod(question, today);
    const plan = analysisPlan(detectIntent(question));
    return period && period.to <= today ? { ...plan, periodOverride: period } : plan;
  }

  const period = parsePeriod(question, today);
  if (isAboutPace(question) || (period && period.from > today)) {
    return { ...analysisPlan('booking_pace'), ...(period && period.from > today ? { paceWindowOverride: period } : {}) };
  }

  const blockPeriod = parseGroupBlockQuestion(question, today);
  if (blockPeriod) return groupBlocksPlan(blockPeriod);

  const dataQuestion = parseDataQuestion(question, today);
  if (dataQuestion) return dataQuestionPlan(dataQuestion.query, { primaryMetric: dataQuestion.primaryMetric, rankBy: dataQuestion.rankBy });

  return analysisPlan(detectIntent(question));
}

/**
 * The plan for an investigation opened from the briefing: exactly the analysis
 * it names, on its dates. Dates that do not fit (a pace window in the past, an
 * analysis period in the future) are ignored and the defaults are used.
 */
export function planForInvestigation(investigation: InvestigationContext, today: IsoDate): InsightPlan {
  const { intent, dateRange } = investigation;
  if (intent === 'group_blocks') return groupBlocksPlan(dateRange ?? { from: today, to: today });
  if (intent === 'data_question') return dataQuestionPlanFor(investigation, today);
  // Maintenance impact is answered from get_room_events by its own branch (runInsight), never as an analysis.
  if (intent === 'maintenance_impact') throw new Error('A maintenance investigation has its own answer, not an analysis plan');
  const plan = analysisPlan(intent);
  if (!dateRange) return plan;
  if (intent === 'booking_pace') return dateRange.from > today ? { ...plan, paceWindowOverride: dateRange } : plan;
  return dateRange.to <= today ? { ...plan, periodOverride: dateRange } : plan;
}

/** Investigation metrics that a data query can lead with; the others read as room revenue. */
const BREAKDOWN_METRIC_OF: Partial<Record<MetricId, BreakdownMetric>> = {
  occupancy: 'occupancy',
  adr: 'adr',
  revpar: 'revpar',
  net_revpar: 'net_revpar',
  room_revenue: 'room_revenue',
  rooms_sold: 'rooms_sold',
  cancellation_rate: 'cancellations',
};

/**
 * A data question from a chart point or a KPI: the selected nights (past only),
 * split as asked, always next to the same nights last year, ranked by change.
 * The query is validated like any tool input; one that does not fit falls back
 * to month to date.
 */
function dataQuestionPlanFor(investigation: InvestigationContext, today: IsoDate): InsightPlan {
  const monthToDateRange = { from: `${today.slice(0, 8)}01`, to: today };
  const period = investigation.dateRange && investigation.dateRange.to <= today ? investigation.dateRange : monthToDateRange;
  const candidate = {
    period,
    groupBy: investigation.breakdown ?? 'none',
    compareWithLastYear: true,
    ...(investigation.segment ? { segments: [investigation.segment] } : {}),
    ...(investigation.channel ? { channels: [investigation.channel] } : {}),
  };
  const parsed = queryPerformanceInputSchema.safeParse({ hotelId: 'check', ...candidate });
  const { hotelId: _hotelId, ...query } = parsed.success
    ? parsed.data
    : queryPerformanceInputSchema.parse({ hotelId: 'check', period: monthToDateRange, groupBy: 'none', compareWithLastYear: true });
  const primaryMetric = (investigation.metric && BREAKDOWN_METRIC_OF[investigation.metric]) ?? 'room_revenue';
  return dataQuestionPlan(query, { primaryMetric, rankBy: 'change' });
}

/** The tools the templates of an analysis cannot do without. */
const REQUIRED_TOOLS_FOR_INTENT: Record<keyof typeof TOOLS_FOR_INTENT, AnalysisToolName[]> = {
  revenue_gap: ['get_hotel_overview', 'analyze_revenue_drivers'],
  channel_cost: ['get_hotel_overview', 'get_channel_mix'],
  booking_pace: ['get_hotel_overview', 'get_booking_pace'],
  segment_shift: ['get_hotel_overview', 'analyze_revenue_drivers'],
};

/** The order analysis tools run in, whatever order the model listed them. Overview first: it feeds the KPI cards. */
const TOOL_ORDER: AnalysisToolName[] = ['get_hotel_overview', 'analyze_revenue_drivers', 'get_channel_mix', 'get_booking_pace'];

/**
 * Turns the analysis tools a language model chose into a plan.
 * The intent follows from the choice (only channels → channel_cost, only
 * pace → booking_pace, only drivers → segment_shift, else revenue_gap), and
 * the tools that intent needs are added, so the answer can always be written.
 */
export function planFromToolNames(chosenTools: ToolName[]): InsightPlan {
  const chosen = new Set(chosenTools);
  const usesDrivers = chosen.has('analyze_revenue_drivers');
  const usesChannels = chosen.has('get_channel_mix');
  const usesPace = chosen.has('get_booking_pace');

  let intent: keyof typeof TOOLS_FOR_INTENT = 'revenue_gap';
  if (usesChannels && !usesDrivers && !usesPace) intent = 'channel_cost';
  else if (usesPace && !usesDrivers && !usesChannels) intent = 'booking_pace';
  else if (usesDrivers && !usesChannels && !usesPace) intent = 'segment_shift';

  const tools = new Set<ToolName>([...chosen, ...REQUIRED_TOOLS_FOR_INTENT[intent]]);
  return { intent, steps: TOOL_ORDER.filter((tool) => tools.has(tool)).map((tool) => STEP_FOR_TOOL[tool]) };
}
