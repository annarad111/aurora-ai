import {
  formatPeriodLabel,
  METRIC_META,
  type ActionPriority,
  type BreakdownMetric,
  type BriefingInsight,
  type BriefingPriority,
  type EvidenceReference,
  type MetricId,
  type NewSavedInsight,
  type SavedInsight,
  type SavedMeasure,
} from '@aurora/shared';
import type { RunState } from '../../stream/run-reducer';

// ---------------------------------------------------------------------------
// What gets saved, and what Aurora suggests doing about it.
//
// A saved insight keeps the figure as it was (value and baseline), its
// period, the evidence behind it, where it came from, and the question that
// investigates it again. Everything is copied from data already on screen:
// nothing is computed or written by a model here.
// ---------------------------------------------------------------------------

const MAXIMUM_DESCRIPTION_LENGTH = 1200;

export function briefingSourceKey(item: BriefingInsight): string {
  return `briefing:${item.id}`;
}

export function answerSourceKey(run: RunState): string | null {
  return run.runId ? `answer:${run.runId}` : null;
}

export function insightFromBriefing(item: BriefingInsight, hotelId: string): NewSavedInsight {
  return {
    hotelId,
    sourceKey: briefingSourceKey(item),
    origin: 'briefing',
    title: item.title,
    description: item.explanation.slice(0, MAXIMUM_DESCRIPTION_LENGTH),
    metric: item.action.context.metric ?? null,
    measure: {
      label: item.measure.label,
      unit: item.measure.unit,
      value: item.measure.value,
      baseline: item.measure.baseline,
      baselineLabel: item.measure.baselineLabel,
    },
    period: item.period,
    evidence: [{ label: item.source, factId: null, tool: item.sourceTool }],
    sourceConversationId: null,
    investigation: { question: item.action.question, context: item.action.context },
  };
}

const METRIC_OF_BREAKDOWN: Partial<Record<BreakdownMetric, MetricId>> = {
  occupancy: 'occupancy',
  adr: 'adr',
  revpar: 'revpar',
  net_revpar: 'net_revpar',
  room_revenue: 'room_revenue',
  rooms_sold: 'rooms_sold',
};

/** The one figure an answer is about, against its baseline, read from the answer's own charts. */
function measureOfAnswer(run: RunState): { metric: MetricId | null; measure: SavedMeasure | null } {
  const intent = run.completion?.context?.intent;
  const charts = run.charts;
  if (intent === 'booking_pace' && charts.booking_pace?.kind === 'booking_pace') {
    const pace = charts.booking_pace.data;
    return {
      metric: 'booking_pace',
      measure: { label: 'Room nights on the books', unit: 'count', value: pace.roomsOnTheBooks, baseline: pace.roomsOnTheBooksLastYear, baselineLabel: 'last year at this point' },
    };
  }
  if (intent === 'channel_cost' && charts.channel_mix?.kind === 'channel_mix') {
    const ota = charts.channel_mix.data.channels.find((channel) => channel.channel === 'ota');
    if (ota) {
      return {
        metric: 'ota_share',
        measure: { label: 'Booking sites (OTA) share of revenue', unit: 'ratio', value: ota.revenueShare, baseline: ota.revenueShareLastYear, baselineLabel: 'last year' },
      };
    }
  }
  if ((intent === 'revenue_gap' || intent === 'segment_shift') && charts.revenue_bridge?.kind === 'revenue_bridge') {
    const drivers = charts.revenue_bridge.data;
    return {
      metric: 'room_revenue',
      measure: { label: 'Room revenue', unit: 'currency', value: drivers.roomRevenueActual, baseline: drivers.roomRevenueTarget, baselineLabel: 'target' },
    };
  }
  if (intent === 'data_question' && charts.performance_table?.kind === 'performance_table') {
    const primary = run.completion?.context?.primaryMetric;
    const metric = primary ? METRIC_OF_BREAKDOWN[primary] : undefined;
    if (metric) {
      const totals = charts.performance_table.data.totals;
      const key = metric === 'net_revpar' ? 'netRevpar' : metric === 'room_revenue' ? 'roomRevenue' : metric === 'rooms_sold' ? 'roomsSold' : metric;
      const value = totals[key as keyof typeof totals] as number;
      const lastYear = totals.lastYear ? (totals.lastYear[key as keyof typeof totals.lastYear] as number) : null;
      return {
        metric,
        measure: { label: METRIC_META[metric].label, unit: METRIC_META[metric].unit, value, baseline: lastYear, baselineLabel: lastYear === null ? null : 'last year' },
      };
    }
  }
  const kpi = run.kpis[0];
  if (kpi) {
    return {
      metric: kpi.metric,
      measure: {
        label: kpi.label,
        unit: METRIC_META[kpi.metric].unit,
        value: kpi.actual,
        baseline: kpi.reference,
        baselineLabel: kpi.reference === null ? null : kpi.referenceKind === 'last_year' ? 'last year' : 'target',
      },
    };
  }
  return { metric: null, measure: null };
}

/** An analysis answer, as a saved insight. Null for replies in words, or before the answer is complete. */
export function insightFromAnswer(run: RunState, hotelId: string, conversationId: string): NewSavedInsight | null {
  const sourceKey = answerSourceKey(run);
  if (!sourceKey || run.phase !== 'done' || !run.insight || run.completion?.answerKind !== 'analysis') return null;
  const { metric, measure } = measureOfAnswer(run);
  const evidence: EvidenceReference[] = run.insight.factIds.flatMap((factId) => {
    const provenance = run.provenanceByFactId[factId];
    return provenance ? [{ label: `${provenance.title}: ${provenance.displayValue}`.slice(0, 160), factId, tool: provenance.tool }] : [];
  });
  return {
    hotelId,
    sourceKey,
    origin: 'answer',
    title: run.insight.headline.slice(0, 200),
    description: run.explanation
      .map((segment) => segment.text)
      .join('')
      .trim()
      .slice(0, MAXIMUM_DESCRIPTION_LENGTH),
    metric,
    measure,
    period: run.completion?.context?.period ?? null,
    evidence,
    sourceConversationId: conversationId,
    investigation: { question: run.question, context: run.investigation },
  };
}

// --- Aurora's suggestion ---------------------------------------------------------

export interface ActionSuggestion {
  title: string;
  description: string;
  priority: ActionPriority;
}

const PRIORITY_OF_BRIEFING: Record<BriefingPriority, ActionPriority> = { critical: 'high', important: 'medium', opportunity: 'low' };

/**
 * A starting point for an action, written by fixed rules from the insight's
 * figure. Shown as a suggestion the user edits and saves; never saved on its own.
 */
export function suggestActionFor(insight: SavedInsight, briefingPriority?: BriefingPriority): ActionSuggestion {
  const period = insight.period ? formatPeriodLabel(insight.period) : 'the period';
  const isBelowBaseline = insight.measure?.baseline !== null && insight.measure !== null && insight.measure.value < (insight.measure.baseline ?? 0);
  const priority = briefingPriority ? PRIORITY_OF_BRIEFING[briefingPriority] : isBelowBaseline ? 'high' : 'medium';
  switch (insight.metric) {
    case 'booking_pace':
      return {
        title: `Review direct-booking offers for ${period}`,
        description: 'Bookings for these nights are behind last year. Check rates and visibility on the weakest nights, and decide whether a direct-booking offer is worth it.',
        priority,
      };
    case 'room_revenue':
    case 'rooms_sold':
      return {
        title: 'Find business to replace the lost room nights',
        description: 'Look for groups, corporate accounts or packages that can fill the nights that fell short of plan.',
        priority,
      };
    case 'ota_share':
    case 'net_revpar':
      return {
        title: 'Shift bookings from booking sites to direct',
        description: 'Booking sites take a bigger share than last year. Review the direct-booking offer and how visible it is on the hotel website.',
        priority,
      };
    case 'occupancy':
      return { title: `Look at demand for the weakest nights of ${period}`, description: 'Check which segments and channels are missing on those nights.', priority };
    case 'adr':
    case 'revpar':
      return { title: 'Review rates for the coming nights', description: 'Check where the rate can hold and where it should move.', priority };
    default:
      return { title: `Follow up: ${insight.title}`.slice(0, 160), description: '', priority };
  }
}
