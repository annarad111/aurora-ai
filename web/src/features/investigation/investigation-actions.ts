import {
  formatPeriodLabel,
  METRIC_META,
  type DateRange,
  type InvestigationContext,
  type IsoDate,
  type MetricId,
} from '@aurora/shared';
import { formatWeekdayDate } from '../../lib/dates';
import { formatMetricReference, formatMetricValue } from '../../lib/metric-display';
import type { InsightView } from '../explore/explore-views';

// ---------------------------------------------------------------------------
// What can be done with a selection: a night in a chart, or a KPI card.
//
// A selection is plain data (the figure, its baseline, its dates). The actions
// depend on what was selected and on the data behind it: a past night can be
// explained by segment, a future night by its bookings, a KPI by its drivers.
// Every question carries an InvestigationContext, so the server runs exactly
// that analysis; the question text is only what the user reads.
// ---------------------------------------------------------------------------

export type InvestigationSelection =
  | {
      kind: 'occupancy_night';
      date: IsoDate;
      occupancy: number;
      target: number | null;
      lastYear: number;
      /** The cancelled group block on this night, from the group_blocks table. */
      cancelledBlockName: string | null;
    }
  | {
      kind: 'pace_night';
      date: IsoDate;
      roomsOnTheBooks: number;
      roomsOnTheBooksLastYear: number;
    }
  | {
      kind: 'kpi';
      metric: MetricId;
      factId: string;
      label: string;
      actual: number;
      reference: number | null;
      referenceKind: 'target' | 'last_year' | 'none';
      /** The nights the KPI covers, when the answer's overview is known. */
      period: DateRange | null;
    };

export type InvestigationAction =
  | { kind: 'ask'; id: string; label: string; question: string; context: InvestigationContext }
  /** Opens "How was this calculated?" for a figure: no request, the evidence is already here. */
  | { kind: 'evidence'; id: string; label: string; factId: string }
  | { kind: 'explore'; id: string; label: string; view: InsightView };

/** A figure shown in the panel: "Occupancy 37.8%", "Target 75.0%". */
export interface SelectionFigure {
  label: string;
  value: string;
  /** "−37.2 pp", shown next to the baselines. */
  delta?: string;
}

export interface SelectionSummary {
  eyebrow: string;
  title: string;
  figures: SelectionFigure[];
  note: string | null;
}

function percentagePoints(difference: number): string {
  const points = (difference * 100).toFixed(1);
  return `${difference >= 0 ? '+' : '−'}${points.replace('-', '')} pp`;
}

function relativeDelta(value: number, baseline: number): string {
  if (baseline === 0) return '';
  const change = value / baseline - 1;
  return `${change >= 0 ? '+' : '−'}${Math.round(Math.abs(change) * 100)}%`;
}

const lowerCaseLabel = (metric: MetricId) => (metric === 'adr' || metric === 'revpar' ? METRIC_META[metric].label : METRIC_META[metric].label.toLowerCase());

/** What the panel shows about the selection: the figure, its baselines and the difference. */
export function summarizeSelection(selection: InvestigationSelection): SelectionSummary {
  switch (selection.kind) {
    case 'occupancy_night':
      return {
        eyebrow: 'Selected night',
        title: formatWeekdayDate(selection.date),
        figures: [
          { label: 'Occupancy', value: formatMetricValue('occupancy', selection.occupancy) },
          ...(selection.target === null
            ? []
            : [{ label: 'Target', value: formatMetricValue('occupancy', selection.target), delta: percentagePoints(selection.occupancy - selection.target) }]),
          { label: 'Last year', value: formatMetricValue('occupancy', selection.lastYear), delta: percentagePoints(selection.occupancy - selection.lastYear) },
        ],
        note: selection.cancelledBlockName ? `${selection.cancelledBlockName} was cancelled for this night.` : null,
      };
    case 'pace_night':
      return {
        eyebrow: 'Selected stay date',
        title: formatWeekdayDate(selection.date),
        figures: [
          { label: 'On the books', value: formatMetricValue('booking_pace', selection.roomsOnTheBooks) },
          {
            label: 'Same point last year',
            value: formatMetricValue('booking_pace', selection.roomsOnTheBooksLastYear),
            delta: relativeDelta(selection.roomsOnTheBooks, selection.roomsOnTheBooksLastYear),
          },
        ],
        note: 'This night has not happened yet: bookings can still come in.',
      };
    case 'kpi':
      return {
        eyebrow: selection.period ? `KPI · ${formatPeriodLabel(selection.period)}` : 'KPI',
        title: selection.label,
        figures: [
          { label: selection.label, value: formatMetricValue(selection.metric, selection.actual) },
          ...(selection.reference === null
            ? []
            : [
                {
                  label: selection.referenceKind === 'target' ? 'Target' : 'Last year',
                  value: formatMetricReference(selection.metric, selection.reference),
                  delta:
                    METRIC_META[selection.metric].deltaStyle === 'percentage_points'
                      ? percentagePoints(selection.actual - selection.reference)
                      : relativeDelta(selection.actual, selection.reference),
                },
              ]),
        ],
        note: null,
      };
  }
}

/** Is the selected figure below its baseline (where higher is better)? */
function isBelowBaseline(selection: InvestigationSelection): boolean {
  switch (selection.kind) {
    case 'occupancy_night':
      return selection.occupancy < (selection.target ?? selection.lastYear);
    case 'pace_night':
      return selection.roomsOnTheBooks < selection.roomsOnTheBooksLastYear;
    case 'kpi': {
      if (selection.reference === null) return false;
      const isLower = selection.actual < selection.reference;
      return METRIC_META[selection.metric].direction === 'higher_is_better' ? isLower : !isLower;
    }
  }
}

/** KPIs that the revenue analysis explains (volume, rate, mix). */
const EXPLAINED_BY_REVENUE_ANALYSIS: ReadonlySet<MetricId> = new Set(['occupancy', 'adr', 'revpar', 'room_revenue', 'rooms_sold']);

export interface ActionOptions {
  /** Facts whose calculation can be shown ("How was this calculated?"). */
  hasEvidenceFor: (factId: string) => boolean;
  /** False inside the Explore view itself, where the view is already open. */
  canOpenView: (view: InsightView) => boolean;
}

/** The actions for a selection, most useful first. */
export function actionsForSelection(selection: InvestigationSelection, options: ActionOptions): InvestigationAction[] {
  const isBelow = isBelowBaseline(selection);
  const actions: InvestigationAction[] = [];

  switch (selection.kind) {
    case 'occupancy_night': {
      const night = formatWeekdayDate(selection.date);
      const baseline = selection.target ?? selection.lastYear;
      const shared = {
        origin: 'chart',
        intent: 'data_question',
        metric: 'occupancy',
        date: selection.date,
        dateRange: { from: selection.date, to: selection.date },
        selectedValue: selection.occupancy,
        baseline,
        baselineLabel: selection.target === null ? 'last year' : 'target',
      } as const;
      actions.push({
        kind: 'ask',
        id: 'explain',
        label: isBelow ? 'Explain this drop' : 'Explain this night',
        question: isBelow ? `Why was occupancy low on ${night}?` : `What drove occupancy on ${night}?`,
        context: { ...shared, interaction: 'explain', breakdown: 'segment' },
      });
      actions.push({
        kind: 'ask',
        id: 'compare-channels',
        label: 'Compare by channel',
        question: `How did each channel do on ${night} vs last year?`,
        context: { ...shared, interaction: 'compare', breakdown: 'channel' },
      });
      if (options.hasEvidenceFor('occupancy')) actions.push({ kind: 'evidence', id: 'evidence', label: 'Show supporting evidence', factId: 'occupancy' });
      break;
    }

    case 'pace_night': {
      const night = formatWeekdayDate(selection.date);
      actions.push({
        kind: 'ask',
        id: 'explain',
        label: isBelow ? 'Explain this gap' : 'Explain this night',
        question: isBelow ? `Why are bookings for ${night} behind last year?` : `How are bookings for ${night} doing vs last year?`,
        context: {
          origin: 'chart',
          intent: 'booking_pace',
          interaction: 'explain',
          metric: 'booking_pace',
          date: selection.date,
          dateRange: { from: selection.date, to: selection.date },
          selectedValue: selection.roomsOnTheBooks,
          baseline: selection.roomsOnTheBooksLastYear,
          baselineLabel: 'same point last year',
        },
      });
      if (options.canOpenView('pace')) actions.push({ kind: 'explore', id: 'scenarios', label: 'Explore recovery scenarios', view: 'pace' });
      if (options.hasEvidenceFor('booking_pace')) actions.push({ kind: 'evidence', id: 'evidence', label: 'Show supporting evidence', factId: 'booking_pace' });
      break;
    }

    case 'kpi': {
      const metricWords = lowerCaseLabel(selection.metric);
      const periodWords = selection.period ? ` for ${formatPeriodLabel(selection.period)}` : ' this month';
      const shared = {
        origin: 'kpi',
        metric: selection.metric,
        ...(selection.period ? { dateRange: selection.period } : {}),
        selectedValue: selection.actual,
        ...(selection.reference === null ? {} : { baseline: selection.reference, baselineLabel: selection.referenceKind === 'target' ? 'target' : 'last year' }),
      } as const;

      if (selection.reference !== null && (EXPLAINED_BY_REVENUE_ANALYSIS.has(selection.metric) || selection.metric === 'net_revpar')) {
        const direction = selection.actual < selection.reference ? 'below' : 'above';
        const reference = selection.referenceKind === 'target' ? 'target' : 'last year';
        actions.push({
          kind: 'ask',
          id: 'why',
          label: 'Why did it change?',
          question: `Why is ${metricWords} ${direction} ${reference}${periodWords}?`,
          context: { ...shared, interaction: 'explain', intent: selection.metric === 'net_revpar' ? 'channel_cost' : 'revenue_gap' },
        });
      }
      actions.push({
        kind: 'ask',
        id: 'compare',
        label: 'Compare with last year',
        question: `How does ${metricWords} compare with last year${periodWords}?`,
        context: { ...shared, interaction: 'compare', intent: 'data_question', breakdown: 'none' },
      });
      const splitBy = selection.metric === 'net_revpar' ? 'channel' : 'segment';
      actions.push({
        kind: 'ask',
        id: 'contributors',
        label: splitBy === 'channel' ? 'Explore contributing channels' : 'Explore contributing segments',
        question: `Which ${splitBy}s drive ${metricWords}${periodWords}?`,
        context: { ...shared, interaction: 'investigate', intent: 'data_question', breakdown: splitBy },
      });
      if (options.hasEvidenceFor(selection.factId)) actions.push({ kind: 'evidence', id: 'evidence', label: 'Show supporting evidence', factId: selection.factId });
      break;
    }
  }
  return actions;
}

/**
 * The line above a question that came from a selection, so the user sees what
 * was selected even after the chart is gone: "From the chart · Wed 11 Nov ·
 * occupancy 37.8% vs target 75.0%".
 */
export function describeInvestigationOrigin(context: InvestigationContext): string | null {
  if (context.origin === 'briefing') return 'From your morning briefing';
  if (context.origin === 'property') return 'From the property overview';
  const parts = [context.origin === 'chart' ? 'From the chart' : `From the ${context.metric ? METRIC_META[context.metric].label : 'KPI'} card`];
  if (context.date) parts.push(formatWeekdayDate(context.date));
  if (context.metric && context.selectedValue !== undefined) {
    const value = formatMetricValue(context.metric, context.selectedValue);
    const baseline =
      context.baseline === undefined ? '' : ` vs ${formatMetricReference(context.metric, context.baseline)}${context.baselineLabel ? ` ${context.baselineLabel}` : ''}`;
    // Pace counts are room nights on the books; other metrics are named before their value.
    const prefix = context.metric === 'booking_pace' ? '' : context.origin === 'chart' ? `${lowerCaseLabel(context.metric)} ` : '';
    const unit = context.metric === 'booking_pace' ? ' room nights on the books' : '';
    parts.push(`${prefix}${value}${unit}${baseline}`);
  }
  return parts.join(' · ');
}
