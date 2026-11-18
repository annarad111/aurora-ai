import {
  BREAKDOWN_DIMENSION_LABELS,
  BREAKDOWN_METRIC_INFO,
  BREAKDOWN_METRICS,
  CHANNEL_LABELS,
  formatCount,
  formatPercent,
  formatPercentagePoints,
  formatPeriodLabel,
  SEGMENT_LABELS,
  type BreakdownMetric,
  type GroupBlock,
  type PerformanceRow,
  type PerformanceValues,
  type QueryPerformanceOutput,
} from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import { describeDate, describeNights } from './derived-facts';
import type { CatalogueEntry } from './figure-catalogue';
import type { InsightDraft, NarrativeSegment } from './narrative-writer';
import type { ProvenancePayload } from './provenance';

// ---------------------------------------------------------------------------
// Answers to free-form data questions: everything built from query_performance
// and get_group_blocks results. The template text, the fact ids, the
// provenance, the model's placeholders and the follow-ups live together here,
// so they always describe the same numbers.
//
// Fact ids:  query.<query index>.<row key>.<metric>   e.g. query.0.weekend.adr
//            block.<block id>                          e.g. block.eu-health-congress-2026
// ---------------------------------------------------------------------------

type DataProvenance = Omit<ProvenancePayload, 'exploreView' | 'followupQuestions'>;

const plain = (text: string): NarrativeSegment => ({ text });
const figure = (factId: string, text: string): NarrativeSegment => ({ text, factId });

const VALUE_OF_METRIC: Record<BreakdownMetric, (values: PerformanceValues) => number> = {
  occupancy: (values) => values.occupancy,
  adr: (values) => values.adr,
  revpar: (values) => values.revpar,
  net_revpar: (values) => values.netRevpar,
  room_revenue: (values) => values.roomRevenue,
  rooms_sold: (values) => values.roomsSold,
  cancellations: (values) => values.cancellations,
};

export function valueOf(values: PerformanceValues, metric: BreakdownMetric): number {
  return VALUE_OF_METRIC[metric](values);
}

export function queryFactId(queryIndex: number, rowKey: string, metric: BreakdownMetric): string {
  return `query.${queryIndex}.${rowKey}.${metric}`;
}

/** "ADR", "RevPAR" and "Net RevPAR" keep their capitals inside a sentence; "Occupancy" becomes "occupancy". */
function metricInSentence(metric: BreakdownMetric): string {
  const label = BREAKDOWN_METRIC_INFO[metric].label;
  return /^[A-Z][a-z ]+$/.test(label) ? label.toLowerCase() : label;
}

/** Change vs last year in words: "+4.0 pp" for ratios, "+4.0%" for everything else. */
export function describeChangeVsLastYear(metric: BreakdownMetric, values: PerformanceValues, lastYear: PerformanceValues): string {
  const current = valueOf(values, metric);
  const previous = valueOf(lastYear, metric);
  if (metric === 'occupancy') return `${formatPercentagePoints(current - previous)} vs last year`;
  return previous === 0 ? 'no comparable nights last year' : `${formatPercent(current / previous - 1, { signDisplay: 'always' })} vs last year`;
}

/** "for 1–17 Nov 2026", "for weekend nights, 1–17 Nov 2026, OTA only". */
function describeScope(output: QueryPerformanceOutput): string {
  const parts = [formatPeriodLabel(output.period)];
  if (output.filters.dayType) parts.unshift(`${output.filters.dayType} nights`);
  const filterNames = [
    ...(output.filters.segments ?? []).map((segment) => SEGMENT_LABELS[segment]),
    ...(output.filters.channels ?? []).map((channel) => CHANNEL_LABELS[channel]),
  ];
  if (filterNames.length > 0) parts.push(`${filterNames.join(' and ')} only`);
  return parts.join(', ');
}

/** Rows ranked for the answer: highest value first, or largest change vs last year first. */
function rankRows(output: QueryPerformanceOutput, metric: BreakdownMetric, rankBy: 'value' | 'change'): PerformanceRow[] {
  const score = (row: PerformanceRow) =>
    rankBy === 'change' && row.lastYear ? Math.abs(valueOf(row, metric) - valueOf(row.lastYear, metric)) : valueOf(row, metric);
  // Nights or segments with no sales at all say little; keep them out of "highest/lowest" unless everything is zero.
  const withSales = output.rows.filter((row) => row.roomsSold > 0);
  return [...(withSales.length > 0 ? withSales : output.rows)].sort((first, second) => score(second) - score(first));
}

function readFocus(analysis: AnalysisContext) {
  return { metric: analysis.dataFocus?.primaryMetric ?? 'room_revenue', rankBy: analysis.dataFocus?.rankBy ?? 'value' };
}

// --- The written answer -----------------------------------------------------------

export function* explainDataQuestion(analysis: AnalysisContext): Iterable<NarrativeSegment> {
  const { metric, rankBy } = readFocus(analysis);
  for (const [queryIndex, { output }] of (analysis.results.queries ?? []).entries()) {
    const format = BREAKDOWN_METRIC_INFO[metric].format;
    const singleRow = output.groupBy === 'none' || output.rows.length === 1 ? (output.rows[0] ?? output.totals) : null;

    if (singleRow) {
      // "For 5 Nov 2026, occupancy was 64.0%, ADR €182.10, RevPAR €116.54 and room revenue €12,936 (71 room nights)."
      const metricsInOrder = [metric, ...(['occupancy', 'adr', 'revpar', 'room_revenue'] as const).filter((other) => other !== metric)];
      yield plain(`For ${describeScope(output)}, `);
      for (const [position, shownMetric] of metricsInOrder.entries()) {
        const separator = position === 0 ? '' : position === metricsInOrder.length - 1 ? ' and ' : ', ';
        yield plain(`${separator}${metricInSentence(shownMetric)}${position === 0 ? ' was ' : ' '}`);
        yield figure(queryFactId(queryIndex, singleRow.key, shownMetric), BREAKDOWN_METRIC_INFO[shownMetric].format(valueOf(singleRow, shownMetric)));
      }
      yield plain(' (');
      yield figure(queryFactId(queryIndex, singleRow.key, 'rooms_sold'), `${formatCount(singleRow.roomsSold)} room nights`);
      yield plain(' sold).');
      if (singleRow.lastYear) {
        yield plain(` Last year, ${metricInSentence(metric)} was ${format(valueOf(singleRow.lastYear, metric))} (${describeChangeVsLastYear(metric, singleRow, singleRow.lastYear)}).`);
      }
      continue;
    }

    // "ADR by channel for 1–17 Nov 2026: Direct €191.20, GDS €188.40, OTA €172.10 and Wholesale €150.80. Overall €178.00."
    const ranked = rankRows(output, metric, rankBy);
    const shown = ranked.length <= 5 ? ranked : [...ranked.slice(0, 3), ranked[ranked.length - 1]!];
    const rankingWords = rankBy === 'change' ? ', largest change vs last year first' : '';
    yield plain(`${BREAKDOWN_METRIC_INFO[metric].label} ${BREAKDOWN_DIMENSION_LABELS[output.groupBy]} for ${describeScope(output)}${rankingWords}: `);
    for (const [position, row] of shown.entries()) {
      const isLowestAfterGap = ranked.length > 5 && position === shown.length - 1;
      const separator = position === 0 ? '' : isLowestAfterGap ? ', and the lowest, ' : position === shown.length - 1 ? ' and ' : ', ';
      yield plain(`${separator}${row.label} `);
      yield figure(queryFactId(queryIndex, row.key, metric), format(valueOf(row, metric)));
      if (row.lastYear) yield plain(` (${describeChangeVsLastYear(metric, row, row.lastYear)})`);
    }
    yield plain('. Overall: ');
    yield figure(queryFactId(queryIndex, 'total', metric), format(valueOf(output.totals, metric)));
    if (output.totals.lastYear) yield plain(` (${describeChangeVsLastYear(metric, output.totals, output.totals.lastYear)})`);
    yield plain('.');
  }
}

export function* explainGroupBlocks(analysis: AnalysisContext): Iterable<NarrativeSegment> {
  const result = analysis.results.groupBlocks;
  if (!result) return;
  const periodLabel = describeNights(result.period);
  if (result.blocks.length === 0) {
    yield plain(`There are no group blocks with nights between ${periodLabel}.`);
    return;
  }
  const cancelled = result.blocks.filter((block) => block.status === 'cancelled');
  if (result.blocks.length === 1) {
    yield plain(`There is one group block with nights in ${periodLabel}: `);
  } else {
    yield plain(`There are ${result.blocks.length} group blocks with nights in ${periodLabel}`);
    yield plain(cancelled.length > 0 ? `, ${cancelled.length} of them cancelled: ` : ', all confirmed: ');
  }
  for (const [position, block] of result.blocks.entries()) {
    yield plain(position === 0 ? '' : position === result.blocks.length - 1 ? ' and ' : ', ');
    yield plain(`${block.name} on ${describeNights({ from: block.firstNight, to: block.lastNight })} (`);
    yield figure(`block.${block.id}`, `${block.roomsPerNight} rooms a night`);
    yield plain(block.status === 'cancelled' ? `, cancelled${block.cancelledOn ? ` on ${describeDate(block.cancelledOn)}` : ''})` : ', confirmed)');
  }
  yield plain('. Confirmed blocks are not at risk in the data; it holds no signals beyond their status.');
}

// --- The main finding ---------------------------------------------------------------

export function writeDataInsight(analysis: AnalysisContext): InsightDraft {
  const { metric, rankBy } = readFocus(analysis);
  const query = analysis.results.queries?.[0];
  if (!query) return { headline: 'No data was returned for this question.', impactEur: null, factIds: [], chips: [] };
  const { output } = query;
  const format = BREAKDOWN_METRIC_INFO[metric].format;
  const label = BREAKDOWN_METRIC_INFO[metric].label;

  if (output.groupBy === 'none' || output.rows.length === 1) {
    const row = output.rows[0] ?? output.totals;
    return {
      headline: `${label} was ${format(valueOf(row, metric))} for ${describeScope(output)}.`,
      impactEur: null,
      factIds: [queryFactId(0, row.key, metric)],
      chips: (['occupancy', 'adr', 'revpar'] as const).map((chipMetric) => ({
        factId: queryFactId(0, row.key, chipMetric),
        label: `${BREAKDOWN_METRIC_INFO[chipMetric].label} ${BREAKDOWN_METRIC_INFO[chipMetric].format(valueOf(row, chipMetric))}`,
      })),
    };
  }

  const ranked = rankRows(output, metric, rankBy);
  const top = ranked[0]!;
  const bottom = ranked[ranked.length - 1]!;
  const headline =
    rankBy === 'change' && top.lastYear
      ? `${top.label} moved most: ${metricInSentence(metric)} ${format(valueOf(top, metric))}, ${describeChangeVsLastYear(metric, top, top.lastYear)}.`
      : `${top.label} has the highest ${metricInSentence(metric)} at ${format(valueOf(top, metric))}; ${bottom.label} the lowest at ${format(valueOf(bottom, metric))}.`;
  return {
    headline,
    impactEur: null,
    factIds: [queryFactId(0, top.key, metric), queryFactId(0, bottom.key, metric)],
    chips: ranked.slice(0, 3).map((row) => ({ factId: queryFactId(0, row.key, metric), label: `${row.label} ${format(valueOf(row, metric))}` })),
  };
}

export function writeGroupBlocksInsight(analysis: AnalysisContext): InsightDraft {
  const result = analysis.results.groupBlocks;
  const blocks = result?.blocks ?? [];
  const cancelled = blocks.filter((block) => block.status === 'cancelled');
  return {
    headline:
      blocks.length === 0
        ? 'No group blocks in this period.'
        : `${blocks.length} group block${blocks.length === 1 ? '' : 's'} in this period, ${cancelled.length} cancelled.`,
    impactEur: null,
    factIds: blocks.map((block) => `block.${block.id}`),
    chips: blocks.slice(0, 3).map((block) => ({ factId: `block.${block.id}`, label: block.name, status: block.status === 'cancelled' ? 'off_track' : 'on_track' })),
  };
}

// --- Provenance ------------------------------------------------------------------------

function findRow(output: QueryPerformanceOutput, rowKey: string): PerformanceRow | undefined {
  return rowKey === 'total' ? output.totals : output.rows.find((row) => row.key === rowKey);
}

export function buildDataProvenance(factId: string, analysis: AnalysisContext): DataProvenance | null {
  if (factId.startsWith('block.')) return buildBlockProvenance(factId, analysis);

  const match = /^query\.(\d+)\.(.+)\.([a-z_]+)$/.exec(factId);
  if (!match) return null;
  const query = analysis.results.queries?.[Number(match[1])];
  const metric = match[3] as BreakdownMetric;
  if (!query || !BREAKDOWN_METRICS.includes(metric)) return null;
  const row = findRow(query.output, match[2]!);
  if (!row) return null;

  const info = BREAKDOWN_METRIC_INFO[metric];
  const inputs = [
    { label: 'Rooms sold', value: formatCount(row.roomsSold) },
    { label: 'Rooms available', value: `${formatCount(analysis.hotel.roomCount)} × ${formatCount(row.nights)} nights = ${formatCount(row.roomsAvailable)}` },
    { label: 'Room revenue', value: BREAKDOWN_METRIC_INFO.room_revenue.format(row.roomRevenue) },
    ...(metric === 'net_revpar' ? [{ label: 'Commissions', value: BREAKDOWN_METRIC_INFO.room_revenue.format(-row.commissionCost) }] : []),
    ...(row.lastYear ? [{ label: 'Same nights last year', value: `${info.format(valueOf(row.lastYear, metric))} (${describeChangeVsLastYear(metric, row, row.lastYear)})` }] : []),
  ];
  const isShareOfHotel = query.output.groupBy === 'segment' || query.output.groupBy === 'channel';
  return {
    factId,
    title: `${info.label} · ${row.label}`,
    displayValue: info.format(valueOf(row, metric)),
    tool: 'query_performance',
    formula: isShareOfHotel && (metric === 'occupancy' || metric === 'revpar') ? `${info.formula}\n(rooms available = the whole hotel, so the rows add up)` : info.formula,
    inputs,
    sourceQuery: query.output.sourceQuery,
    contextLabel: `${row.label} ${info.format(valueOf(row, metric))}`,
    contextText:
      `${info.label} for ${row.label === 'Total' || row.key === 'total' ? describeScope(query.output) : `${row.label}, ${describeScope(query.output)}`} ` +
      `was ${info.format(valueOf(row, metric))}: ${formatCount(row.roomsSold)} room nights sold out of ${formatCount(row.roomsAvailable)} available, ` +
      `for ${BREAKDOWN_METRIC_INFO.room_revenue.format(row.roomRevenue)} of room revenue.`,
  };
}

function buildBlockProvenance(factId: string, analysis: AnalysisContext): DataProvenance | null {
  const block: GroupBlock | undefined = analysis.results.groupBlocks?.blocks.find((candidate) => `block.${candidate.id}` === factId);
  if (!block) return null;
  return {
    factId,
    title: block.name,
    displayValue: `${block.roomsPerNight} rooms a night`,
    tool: 'get_group_blocks',
    formula: 'one row of group_blocks',
    inputs: [
      { label: 'Nights', value: describeNights({ from: block.firstNight, to: block.lastNight }) },
      { label: 'Segment', value: SEGMENT_LABELS[block.segment] },
      { label: 'Status', value: block.status },
      ...(block.cancelledOn ? [{ label: 'Cancelled on', value: describeDate(block.cancelledOn) }] : []),
    ],
    sourceQuery: `group_blocks WHERE id = '${block.id}'`,
    contextLabel: block.name,
    contextText: `${block.name}: ${block.roomsPerNight} rooms a night on ${describeNights({ from: block.firstNight, to: block.lastNight })}, ${block.status}${block.cancelledOn ? ` on ${describeDate(block.cancelledOn)}` : ''}.`,
  };
}

/** Rows that get a provenance for every metric (the table card lets the user switch metric). */
const MAXIMUM_ROWS_WITH_PROVENANCE = 40;

/** The data facts that get a provenance event: every metric of every row (up to 40 rows) and of the total, and the blocks. */
export function listDataFactIds(analysis: AnalysisContext): string[] {
  const queryFacts = (analysis.results.queries ?? []).flatMap(({ output }, queryIndex) =>
    [...output.rows.slice(0, MAXIMUM_ROWS_WITH_PROVENANCE), output.totals].flatMap((row) =>
      BREAKDOWN_METRICS.map((metric) => queryFactId(queryIndex, row.key, metric)),
    ),
  );
  const blockFacts = (analysis.results.groupBlocks?.blocks ?? []).map((block) => `block.${block.id}`);
  return [...queryFacts, ...blockFacts];
}

// --- Placeholders for the language model ---------------------------------------------------

/** At most this many rows get placeholders, so the prompt stays small (the top and bottom rows are kept). */
const MAXIMUM_ROWS_IN_CATALOGUE = 12;

export function buildDataCatalogue(analysis: AnalysisContext): CatalogueEntry[] {
  const { metric, rankBy } = readFocus(analysis);
  const entries: CatalogueEntry[] = [];
  for (const [queryIndex, { output }] of (analysis.results.queries ?? []).entries()) {
    entries.push({ key: `q${queryIndex}_scope`, text: describeScope(output), meaning: 'the nights and filters the numbers cover' });
    const ranked = rankRows(output, metric, rankBy);
    const rows = ranked.length <= MAXIMUM_ROWS_IN_CATALOGUE ? ranked : [...ranked.slice(0, MAXIMUM_ROWS_IN_CATALOGUE - 2), ...ranked.slice(-2)];
    const rowsAndTotal: Array<[PerformanceRow, BreakdownMetric[]]> = [
      ...rows.map((row): [PerformanceRow, BreakdownMetric[]] => [row, output.rows.length === 1 ? [...BREAKDOWN_METRICS] : [metric]]),
      [output.totals, [...BREAKDOWN_METRICS]],
    ];
    for (const [row, metrics] of rowsAndTotal) {
      const slug = row.key.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const rowName = row.key === 'total' ? 'the whole selection' : row.label;
      // The row's own name, so dates like "11 Nov 2026" are never typed by the model.
      if (row.key !== 'total') entries.push({ key: `q${queryIndex}_${slug}_name`, text: row.label, meaning: `the name of a row: ${row.label}` });
      for (const shownMetric of metrics) {
        const info = BREAKDOWN_METRIC_INFO[shownMetric];
        const factId = queryFactId(queryIndex, row.key, shownMetric);
        entries.push({ key: `q${queryIndex}_${slug}_${shownMetric}`, factId, text: info.format(valueOf(row, shownMetric)), meaning: `${info.label} for ${rowName}, this period` });
        if (row.lastYear) {
          entries.push(
            { key: `q${queryIndex}_${slug}_${shownMetric}_last_year`, factId, text: info.format(valueOf(row.lastYear, shownMetric)), meaning: `${info.label} for ${rowName}, same nights last year` },
            {
              key: `q${queryIndex}_${slug}_${shownMetric}_change`,
              factId,
              // Without the words "vs last year": models tend to add them again, so the sentence pattern asks for them once.
              text: describeChangeVsLastYear(shownMetric, row, row.lastYear).replace(/ vs last year$/, ''),
              meaning: `the change of ${info.label} for ${rowName} vs last year. Write: "${info.label} changed {q${queryIndex}_${slug}_${shownMetric}_change} vs last year"`,
            },
          );
        }
      }
    }
  }
  for (const block of analysis.results.groupBlocks?.blocks ?? []) {
    entries.push({
      key: `block_${block.id.replace(/[^a-z0-9]+/gi, '_')}`,
      factId: `block.${block.id}`,
      text: `${block.name} (${block.roomsPerNight} rooms a night, ${describeNights({ from: block.firstNight, to: block.lastNight })}, ${block.status})`,
      meaning: `a group block${block.cancelledOn ? `, cancelled on ${describeDate(block.cancelledOn)}` : ''}`,
    });
  }
  return entries;
}

// --- Follow-ups ------------------------------------------------------------------------------

/** Each follow-up is a full question the parser understands on its own (step 14 adds conversation memory). */
export function followupsForDataQuestion(analysis: AnalysisContext): string[] {
  const query = analysis.results.queries?.[0];
  if (!query) return ['Are other group blocks at risk this quarter?', 'Why is my hotel revenue below target this month?'];
  const { metric } = readFocus(analysis);
  const metricLabel = BREAKDOWN_METRIC_INFO[metric].label;
  const groupBy = query.output.groupBy;
  // Keep the question's filters in every follow-up, so clicking one answers the same selection.
  const { dayType, segments, channels } = query.output.filters;
  const filterNames = [...(segments ?? []).map((segment) => SEGMENT_LABELS[segment]), ...(channels ?? []).map((channel) => CHANNEL_LABELS[channel])];
  const filterSuffix = filterNames.length > 0 ? `, ${filterNames.join(' and ')} only` : '';
  const periodLabel = formatPeriodLabel(query.output.period) + (dayType && groupBy !== 'day_type' ? ` on ${dayType} nights` : '') + filterSuffix;
  // The weekend-vs-weekday follow-up splits by day type itself, so it must not keep a weekend filter.
  const periodLabelWithoutDayType = formatPeriodLabel(query.output.period) + filterSuffix;
  const questions = [
    ...(query.input.compareWithLastYear ? [] : [`Compare ${metricLabel} ${groupBy === 'none' ? '' : `${BREAKDOWN_DIMENSION_LABELS[groupBy]} `}with last year for ${periodLabel}`]),
    ...(groupBy !== 'segment' ? [`Show ${metricLabel} by segment for ${periodLabel}`] : []),
    ...(groupBy !== 'channel' ? [`Show ${metricLabel} by channel for ${periodLabel}`] : []),
    ...(groupBy !== 'day_type' ? [`Compare weekend and weekday ${metricLabel} for ${periodLabelWithoutDayType}`] : []),
  ];
  return questions.slice(0, 3).map((question) => question.replace(/\s+/g, ' '));
}
