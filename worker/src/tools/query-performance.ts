import { breakDownPerformance, listCoveredNights, shiftDateByYears, shiftRangeByYears } from '@aurora/analytics';
import {
  BREAKDOWN_DIMENSION_LABELS,
  formatPeriodLabel,
  type DailyStat,
  type PerformanceRow,
  type QueryPerformanceInput,
  type QueryPerformanceOutput,
} from '@aurora/shared';
import { requireHotel, ToolInputError, type ToolContext } from './tool-context';

function applyFilters(rows: readonly DailyStat[], input: QueryPerformanceInput): DailyStat[] {
  return rows.filter(
    (row) => (!input.segments || input.segments.includes(row.segment)) && (!input.channels || input.channels.includes(row.channel)),
  );
}

/** The query in words, shown under "Source" in "How was this calculated?". */
function describeSourceQuery(input: QueryPerformanceInput): string {
  const conditions = [
    `hotel_id = ${input.hotelId}`,
    `date BETWEEN ${input.period.from} AND ${input.period.to}`,
    ...(input.dayType ? [`${input.dayType} nights only (weekend = Fri–Sat)`] : []),
    ...(input.segments ? [`segment IN (${input.segments.join(', ')})`] : []),
    ...(input.channels ? [`channel IN (${input.channels.join(', ')})`] : []),
  ];
  return `daily_stats ⨝ channels WHERE ${conditions.join('\nAND ')}\nGROUP BY ${input.groupBy === 'none' ? '(nothing)' : input.groupBy}`;
}

/**
 * query_performance: any period, split along one dimension, with every metric
 * per row and optionally the same nights last year. The general-purpose tool
 * behind free-form data questions.
 */
export async function queryPerformance(input: QueryPerformanceInput, context: ToolContext): Promise<QueryPerformanceOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  if (input.period.from > context.today) {
    throw new ToolInputError('no_data', `There are no actuals after today (${context.today}). Use get_booking_pace for future nights.`);
  }
  // Actuals stop at today.
  const period = { from: input.period.from, to: input.period.to > context.today ? context.today : input.period.to };
  const commissions = await context.repository.listChannelCommissions();
  const options = { roomCount: hotel.roomCount, dimension: input.groupBy, commissions, ...(input.dayType ? { dayType: input.dayType } : {}) };

  const actualRows = applyFilters(await context.repository.listDailyStats(hotel.id, period), input);
  if (actualRows.length === 0 && listCoveredNights(period, input.dayType).length > 0) {
    const anyData = await context.repository.listDailyStats(hotel.id, period);
    if (anyData.length === 0) throw new ToolInputError('no_data', `There is no data for ${formatPeriodLabel(period)}.`);
  }

  const rows = breakDownPerformance(actualRows, { ...options, period });
  // The total uses the same code without a split, so it respects every filter (weekend nights only, etc.).
  const { key: _totalKey, label: _totalLabel, ...total } = breakDownPerformance(actualRows, { ...options, period, dimension: 'none' })[0]!;

  // The same nights one year earlier, matched to this year's rows by key.
  let lastYearByKey = new Map<string, PerformanceRow['lastYear']>();
  let lastYearTotal: PerformanceRow['lastYear'] = null;
  if (input.compareWithLastYear) {
    const lastYearPeriod = shiftRangeByYears(period, -1);
    const lastYearRows = applyFilters(await context.repository.listDailyStats(hotel.id, lastYearPeriod), input);
    if (lastYearRows.length > 0) {
      const lastYearBreakdown = breakDownPerformance(lastYearRows, { ...options, period: lastYearPeriod });
      lastYearByKey = new Map(
        lastYearBreakdown.map(({ key, label: _label, ...values }) => [input.groupBy === 'day' ? shiftDateByYears(key, 1) : key, values]),
      );
      const { key: _lastYearKey, label: _lastYearLabel, ...lastYearValues } = breakDownPerformance(lastYearRows, {
        ...options,
        period: lastYearPeriod,
        dimension: 'none',
      })[0]!;
      lastYearTotal = lastYearValues;
    }
  }

  return {
    period,
    groupBy: input.groupBy,
    filters: { segments: input.segments ?? null, channels: input.channels ?? null, dayType: input.dayType ?? null },
    rows: rows.map((row) => ({
      ...row,
      label: input.groupBy === 'day' ? formatPeriodLabel({ from: row.key, to: row.key }) : row.label,
      lastYear: lastYearByKey.get(row.key) ?? null,
    })),
    totals: { key: 'total', label: `Total, ${formatPeriodLabel(period)} ${BREAKDOWN_DIMENSION_LABELS.none}`.replace(' in total', ''), ...total, lastYear: lastYearTotal },
    sourceQuery: describeSourceQuery({ ...input, period }),
  };
}
