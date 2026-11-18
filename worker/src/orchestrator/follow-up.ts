import type { AnsweredContext, ConversationTurn, IsoDate, QueryPerformanceInput } from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import { analysisPlan, dataQuestionPlan, groupBlocksPlan, planInsightRun, type InsightPlan } from './insight-plan';
import { isAboutPace, isAboutTheTargetGap, parseFilters, parseGroupBlockQuestion, parseMetric, parsePeriod, parseSplit } from './question-parser';

// ---------------------------------------------------------------------------
// Conversation memory. After "What was ADR by channel in October?", a short
// "and November?" or "what about weekends?" keeps everything the previous
// answer covered and changes only what the new question mentions.
//
// The browser sends back what each answer covered (its AnsweredContext); no
// conversation is stored on the server. These rules are deterministic, so they
// run before the language model: a follow-up is resolved the same way every time.
// ---------------------------------------------------------------------------

type DataQuery = Omit<QueryPerformanceInput, 'hotelId'>;

/** Openings that only make sense after an earlier question: "and…", "what about…", "only…". */
const FOLLOW_UP_OPENING =
  /^(and|but|also|then|now|ok(ay)?|so|what about|how about|same|only|just|instead|compare (that|it)|split (that|it)|break (that|it) down)\b/i;
/** Words that point back at the previous answer. */
const POINTS_BACK = /\b(the same|instead|that period|those nights|same period|same nights)\b/i;
/** Questions this short are read as follow-ups when there is an earlier question ("ADR by segment?"). */
const SHORT_QUESTION_WORDS = 4;

export function isFollowUpQuestion(question: string): boolean {
  const text = question.trim();
  return FOLLOW_UP_OPENING.test(text) || POINTS_BACK.test(text) || text.split(/\s+/).length <= SHORT_QUESTION_WORDS;
}

const MENTIONS_LAST_YEAR = /\b(vs\.?|versus|compared? (with|to)|than) last year\b|\blast year\b|\byear on year\b|\byoy\b/i;
const CHANGE_WORDS = /\b(moved|changed?|grew|fell|dropped|declined|increased|decreased)\b/i;

/** The previous data query with only what the new question mentions changed. Null when it mentions nothing new. */
function adjustDataQuery(question: string, previousQuery: DataQuery, previousMetric: AnsweredContext['primaryMetric'], today: IsoDate): InsightPlan | null {
  const period = parsePeriod(question, today);
  if (period && period.from > today) return null; // Future nights: a pace question, planned fresh.

  const split = parseSplit(question);
  const groupBy = split.groupBy ?? previousQuery.groupBy;
  const filters = parseFilters(question, groupBy);
  const metric = parseMetric(question);
  const asksForLastYear = MENTIONS_LAST_YEAR.test(question);
  const asksForAllNights = /\ball (nights|days)\b/i.test(question);
  const mentionsSomethingNew = Boolean(
    period || split.groupBy || split.dayType || filters.segments || filters.channels || metric || asksForLastYear || asksForAllNights,
  );
  if (!mentionsSomethingNew) return null;

  const query: DataQuery = {
    ...previousQuery,
    period: period ?? previousQuery.period,
    groupBy,
    compareWithLastYear: previousQuery.compareWithLastYear || asksForLastYear,
  };
  if (groupBy === 'day_type' || asksForAllNights) delete query.dayType;
  else if (split.dayType) query.dayType = split.dayType;
  if (filters.segments) query.segments = filters.segments;
  if (filters.channels) query.channels = filters.channels;
  // A split by segment shows every segment, so a segment filter would hide rows (same for channels).
  if (groupBy === 'segment' || /\ball segments\b/i.test(question)) delete query.segments;
  if (groupBy === 'channel' || /\ball channels\b/i.test(question)) delete query.channels;

  return dataQuestionPlan(query, {
    primaryMetric: metric ?? previousMetric ?? 'room_revenue',
    rankBy: query.compareWithLastYear && CHANGE_WORDS.test(question) ? 'change' : 'value',
  });
}

/**
 * The plan for a follow-up question, built on what the previous answer
 * covered. Null when the question is not a follow-up or starts something new;
 * the normal planning then decides.
 */
export function planFollowUp(question: string, previousTurn: ConversationTurn | undefined, today: IsoDate): InsightPlan | null {
  if (!previousTurn || !isFollowUpQuestion(question)) return null;
  const previous = previousTurn.context;
  const previousPeriodIsPast = previous.period.to <= today;

  // "Why?" after a question about October: the gap analysis for October.
  if (isAboutTheTargetGap(question)) {
    const freshPlan = planInsightRun(question, today);
    if (freshPlan.periodOverride || !previousPeriodIsPast || freshPlan.intent === 'data_question') return freshPlan;
    return { ...freshPlan, periodOverride: previous.period };
  }
  if (isAboutPace(question) || parseGroupBlockQuestion(question, today)) return null;

  const period = parsePeriod(question, today);
  switch (previous.intent) {
    case 'data_question':
      return previous.query ? adjustDataQuery(question, previous.query, previous.primaryMetric, today) : null;

    case 'revenue_gap':
    case 'channel_cost':
    case 'segment_shift': {
      const split = parseSplit(question);
      const metric = parseMetric(question);
      // "By segment?" or "ADR?" after an analysis: the numbers for the same nights.
      if (split.groupBy || split.dayType || metric) {
        const queryPeriod = period ?? (previousPeriodIsPast ? previous.period : null);
        if (!queryPeriod || queryPeriod.from > today) return null;
        return adjustDataQuery(question, { period: queryPeriod, groupBy: 'none', compareWithLastYear: false }, undefined, today);
      }
      // "And October?": the same analysis for that month.
      if (period && period.to <= today) return { ...analysisPlan(previous.intent), periodOverride: period };
      return null;
    }

    case 'booking_pace':
      return period && period.from > today ? { ...analysisPlan('booking_pace'), paceWindowOverride: period } : null;

    case 'group_blocks':
      return period ? groupBlocksPlan(period) : null;
  }
}

/** What a finished run covered, sent to the browser so the next question can build on it. */
export function describeAnsweredContext(plan: InsightPlan, analysis: AnalysisContext): AnsweredContext {
  const firstInput = plan.steps[0]?.input;
  if (plan.intent === 'data_question' && firstInput) {
    const query = firstInput as DataQuery;
    return { intent: plan.intent, period: query.period, query, ...(plan.dataFocus ? { primaryMetric: plan.dataFocus.primaryMetric } : {}) };
  }
  if (plan.intent === 'group_blocks' && firstInput) {
    return { intent: plan.intent, period: (firstInput as { period: AnsweredContext['period'] }).period };
  }
  return { intent: plan.intent, period: plan.intent === 'booking_pace' ? analysis.paceWindow : analysis.period };
}

/** One line per earlier turn for the model: the question and what Aurora looked up for it. */
export function describeTurnForModel(turn: ConversationTurn): string {
  const { context } = turn;
  const lookedUp = context.query
    ? `query_performance ${JSON.stringify(context.query)}`
    : `${context.intent.replace('_', ' ')} analysis for ${context.period.from} to ${context.period.to}`;
  return `"${turn.question}" → ${lookedUp}`;
}
