import { countNightsInRange } from '@aurora/analytics';
import {
  CHANNEL_LABELS,
  formatCount,
  formatEuro,
  formatPercent,
  formatPercentagePoints,
  SEGMENT_LABELS,
  SEGMENTS,
  type Segment,
  type StreamEventOfType,
} from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import { buildContextNote } from './context-notes';
import { exploreViewForFact, followupsForFact } from './followups';
import { describeDate, describeNights, findCancelledBlock, findChannelLine, readKpi, relativeChange } from './derived-facts';

// ---------------------------------------------------------------------------
// "How was this calculated?" for every fact id the answer can mention:
// the tool, the formula, the inputs and where the rows come from.
// Returns null when the tool behind a fact was not part of this run.
// ---------------------------------------------------------------------------

export type ProvenancePayload = Omit<StreamEventOfType<'provenance'>, 'type' | 'runId' | 'sequence'>;

/** The calculation part of a provenance event; the context note is added by buildProvenance. */
type CalculationDetails = Omit<ProvenancePayload, 'contextLabel' | 'contextText' | 'exploreView' | 'followupQuestions'>;

type InputRow = ProvenancePayload['inputs'][number];
const row = (label: string, value: string): InputRow => ({ label, value });

const euro = (amount: number) => formatEuro(amount);
const euroWithCents = (amount: number) => formatEuro(amount, { decimals: 2 });
const signedEuro = (amount: number) => formatEuro(amount, { signDisplay: 'always' });
const signedPercent = (ratio: number) => formatPercent(ratio, { signDisplay: 'always' });

/**
 * Every fact id that can appear in an answer: in the text, the chips, the KPI
 * cards or a chart bar. Facts whose tool did not run are skipped by buildProvenance.
 */
export function listKnownFactIds(analysis: AnalysisContext): string[] {
  return [
    'revenue_gap',
    'volume',
    'mix',
    'pure_price',
    'price_effect',
    ...(analysis.results.drivers?.segments.map((segment) => `volume_${segment.segment}`) ?? []),
    'occupancy',
    'adr',
    'revpar',
    'net_revpar',
    'ota_share',
    'commission_cost',
    'commission_mix_shift',
    'booking_pace',
    'pace_pickup',
  ];
}

export function buildProvenance(factId: string, analysis: AnalysisContext): ProvenancePayload | null {
  const calculation = buildCalculationDetails(factId, analysis);
  if (!calculation) return null;
  const contextNote = buildContextNote(factId, analysis);
  return {
    ...calculation,
    contextLabel: contextNote?.contextLabel ?? calculation.title,
    contextText: contextNote?.contextText || `${calculation.title}: ${calculation.displayValue}.`,
    exploreView: exploreViewForFact(factId, analysis),
    followupQuestions: followupsForFact(factId, analysis),
  };
}

function buildCalculationDetails(factId: string, analysis: AnalysisContext): CalculationDetails | null {
  const { hotel, period, paceWindow } = analysis;
  const { overview, drivers, channelMix, pace } = analysis.results;
  const periodSource = `hotel_id = ${hotel.id} · ${period.from} … ${period.to}`;

  if (factId.startsWith('volume_') && drivers) {
    return buildSegmentVolumeProvenance(factId.slice('volume_'.length) as Segment, analysis);
  }

  switch (factId) {
    case 'revenue_gap':
      if (!drivers) return null;
      return {
        factId,
        title: 'Revenue gap vs target',
        displayValue: euro(drivers.revenueGap),
        tool: 'analyze_revenue_drivers',
        formula: 'ΔRev = Rev_actual − Rev_target',
        inputs: [
          row('Room revenue, actual', euro(drivers.roomRevenueActual)),
          row('Room revenue, target', euro(drivers.roomRevenueTarget)),
          row('Gap', `${euro(drivers.revenueGap)} (${signedPercent(relativeChange(drivers.roomRevenueActual, drivers.roomRevenueTarget))})`),
        ],
        sourceQuery: `daily_stats ⨝ targets\n${periodSource}`,
      };

    case 'volume': {
      if (!drivers) return null;
      const roomsActual = sumOver(drivers.segments, (segment) => segment.roomsSoldActual);
      const roomsTarget = sumOver(drivers.segments, (segment) => segment.roomsSoldTarget);
      return {
        factId,
        title: 'Volume effect',
        displayValue: signedEuro(drivers.volumeEffect),
        tool: 'analyze_revenue_drivers',
        formula: '(Sold_a − Sold_t) × ADR_t',
        inputs: [
          row('Room nights sold', formatCount(roomsActual)),
          row('Room nights target', formatCount(roomsTarget)),
          row('Difference', formatCount(roomsActual - roomsTarget, { signDisplay: 'always' })),
          row('ADR target', euroWithCents(drivers.roomRevenueTarget / roomsTarget)),
        ],
        sourceQuery: `variance.ts · decomposeRevenueGap()\ndaily_stats + targets by segment, ${periodSource}`,
      };
    }

    case 'pure_price':
      if (!drivers) return null;
      return {
        factId,
        title: 'Pure price effect',
        displayValue: signedEuro(drivers.purePriceEffect),
        tool: 'analyze_revenue_drivers',
        formula: 'Σ_s (ADR_a,s − ADR_t,s) × Sold_a,s',
        inputs: drivers.segments
          .filter((segment) => segment.roomsSoldActual > 0)
          .map((segment) => row(`${SEGMENT_LABELS[segment.segment]} ADR`, `${euroWithCents(segment.adrActual)} vs ${euroWithCents(segment.adrTarget)} target`)),
        sourceQuery: 'variance.ts · decomposeRevenueGap(), pure price per segment',
      };

    case 'price_effect':
      if (!drivers) return null;
      return {
        factId,
        title: 'Price effect',
        displayValue: signedEuro(drivers.priceEffect),
        tool: 'analyze_revenue_drivers',
        formula: '(ADR_a − ADR_t) × Sold_a\n= mix + pure price',
        inputs: [
          row('Mix effect', signedEuro(drivers.mixEffect)),
          row('Pure price effect', signedEuro(drivers.purePriceEffect)),
          row('Price effect', signedEuro(drivers.priceEffect)),
        ],
        sourceQuery: 'variance.ts · decomposeRevenueGap()',
      };

    case 'mix':
      if (!drivers) return null;
      return {
        factId,
        title: 'Segment mix effect',
        displayValue: signedEuro(drivers.mixEffect),
        tool: 'analyze_revenue_drivers',
        formula: 'Σ_s (w_a,s − w_t,s) × ADR_t,s × Sold_a',
        inputs: drivers.segments.map((segment) =>
          row(
            `${SEGMENT_LABELS[segment.segment]} share`,
            `${formatPercent(segment.shareOfRoomsActual, { decimals: 0 })} vs ${formatPercent(segment.shareOfRoomsTarget, { decimals: 0 })} target`,
          ),
        ),
        sourceQuery: 'variance.ts · decomposeRevenueGap(), mix per segment',
      };

    case 'occupancy':
    case 'adr':
    case 'revpar': {
      if (!overview) return null;
      const kpi = readKpi(overview, factId);
      const occupancy = readKpi(overview, 'occupancy');
      const adr = readKpi(overview, 'adr');
      const nights = countNightsInRange(period);
      const targetRow =
        factId === 'occupancy'
          ? row('Target', kpi.target === null ? '—' : `${formatPercent(kpi.target)} (${formatPercentagePoints(kpi.actual - kpi.target)})`)
          : row('Target', kpi.target === null ? '—' : `${euroWithCents(kpi.target)} (${signedPercent(relativeChange(kpi.actual, kpi.target))})`);
      const details = {
        occupancy: {
          title: 'Occupancy',
          displayValue: formatPercent(kpi.actual),
          formula: 'rooms sold / rooms available',
          inputs: [row('Rooms sold', formatCount(overview.roomsSold)), row('Rooms available', formatCount(overview.roomsAvailable)), targetRow],
          sourceQuery: 'kpi.ts · calculateOccupancy()',
        },
        adr: {
          title: 'ADR vs target',
          displayValue: euroWithCents(kpi.actual),
          formula: 'ADR = room revenue / rooms sold',
          inputs: [row('Room revenue', euro(overview.roomRevenue)), row('Rooms sold', formatCount(overview.roomsSold)), targetRow],
          sourceQuery: 'kpi.ts · calculateAdr()',
        },
        revpar: {
          title: 'RevPAR',
          displayValue: euroWithCents(kpi.actual),
          formula: 'RevPAR = room revenue / rooms available\n= Occupancy × ADR',
          inputs: [
            row('Occupancy × ADR', `${formatPercent(occupancy.actual)} × ${euroWithCents(adr.actual)}`),
            row('Rooms available', `${hotel.roomCount} × ${nights} = ${formatCount(overview.roomsAvailable)}`),
            targetRow,
          ],
          sourceQuery: 'kpi.ts · calculateRevpar()',
        },
      }[factId];
      return { factId, tool: 'get_hotel_overview', ...details, sourceQuery: `${details.sourceQuery}\ndaily_stats, ${periodSource}` };
    }

    case 'ota_share': {
      if (!channelMix) return null;
      const ota = findChannelLine(channelMix, 'ota');
      return {
        factId,
        title: 'OTA share of revenue',
        displayValue: formatPercent(ota.revenueShare, { decimals: 0 }),
        tool: 'get_channel_mix',
        formula: 'revenue(OTA) / room revenue',
        inputs: [
          row('This period', formatPercent(ota.revenueShare)),
          row('Same period last year', formatPercent(ota.revenueShareLastYear)),
          row('Change', formatPercentagePoints(ota.revenueShare - ota.revenueShareLastYear)),
          row('OTA commission', formatPercent(ota.commissionRate, { decimals: 0 })),
        ],
        sourceQuery: `daily_stats ⨝ channels GROUP BY channel\n${periodSource}`,
      };
    }

    case 'commission_cost':
      if (!channelMix) return null;
      return {
        factId,
        title: 'Commission paid',
        displayValue: euro(channelMix.totalCommissionCost),
        tool: 'get_channel_mix',
        formula: 'Σ_c revenue(c) × commission_rate(c)',
        inputs: [
          ...channelMix.channels
            .filter((line) => line.commissionCost > 0)
            .map((line) => row(`${CHANNEL_LABELS[line.channel]} (${formatPercent(line.commissionRate, { decimals: 0 })})`, euro(line.commissionCost))),
          row('Share of room revenue', formatPercent(channelMix.commissionShareOfRevenue)),
        ],
        sourceQuery: 'channels.ts · calculateChannelMix()',
      };

    case 'commission_mix_shift':
      if (!channelMix) return null;
      return {
        factId,
        title: 'Extra commission from the channel shift',
        displayValue: euro(channelMix.extraCommissionFromMixShift),
        tool: 'get_channel_mix',
        formula: 'commission now − Σ_c revenue × share_LY(c) × rate(c)',
        inputs: [
          row('Commission paid', euro(channelMix.totalCommissionCost)),
          row('With last year’s channel mix', euro(channelMix.totalCommissionCost - channelMix.extraCommissionFromMixShift)),
        ],
        sourceQuery: 'channels.ts · calculateExtraCommissionFromMixShift()',
      };

    case 'net_revpar':
      if (!channelMix || !overview) return null;
      return {
        factId,
        title: 'Net RevPAR',
        displayValue: euroWithCents(channelMix.netRevpar),
        tool: 'get_channel_mix',
        formula: '(room revenue − commissions) / rooms available',
        inputs: [
          row('Room revenue', euro(channelMix.roomRevenue)),
          row('Commissions', euro(-channelMix.totalCommissionCost)),
          row('Rooms available', formatCount(overview.roomsAvailable)),
          row(
            'Target',
            channelMix.netRevparTarget === null
              ? '—'
              : `${euroWithCents(channelMix.netRevparTarget)} (${signedPercent(relativeChange(channelMix.netRevpar, channelMix.netRevparTarget))})`,
          ),
        ],
        sourceQuery: 'kpi.ts · calculateNetRevpar()\ntarget = budget revenue minus last year’s commission share',
      };

    case 'booking_pace':
      if (!pace) return null;
      return {
        factId,
        title: `Booking pace, ${describeNights(paceWindow)}`,
        displayValue: formatPercent(pace.changeVsLastYear, { decimals: 0 }),
        tool: 'get_booking_pace',
        formula: 'rooms_otb(today) vs rooms_otb(same day last year)',
        inputs: [
          row('On the books', formatCount(pace.roomsOnTheBooks)),
          row('Last year, same point', formatCount(pace.roomsOnTheBooksLastYear)),
          row('Difference', formatCount(pace.roomsOnTheBooks - pace.roomsOnTheBooksLastYear, { signDisplay: 'always' })),
        ],
        sourceQuery: `on_the_books WHERE snapshot_date = ${pace.snapshotDate}\nAND stay_date BETWEEN ${pace.stayFrom} AND ${pace.stayTo}`,
      };

    case 'pace_pickup':
      if (!pace) return null;
      return {
        factId,
        title: 'Pickup in the last 7 days',
        displayValue: formatCount(pace.pickupLast7Days, { signDisplay: 'always' }),
        tool: 'get_booking_pace',
        formula: 'rooms_otb(today) − rooms_otb(today − 7 days)',
        inputs: [
          row('This year', formatCount(pace.pickupLast7Days, { signDisplay: 'always' })),
          row('Last year', formatCount(pace.pickupLast7DaysLastYear, { signDisplay: 'always' })),
        ],
        sourceQuery: `on_the_books, two snapshots 7 days apart\nstay_date BETWEEN ${pace.stayFrom} AND ${pace.stayTo}`,
      };

    default:
      return null;
  }
}

function buildSegmentVolumeProvenance(segment: Segment, analysis: AnalysisContext): CalculationDetails | null {
  const { drivers, overview } = analysis.results;
  if (!drivers || !SEGMENTS.includes(segment)) return null;
  const variance = drivers.segments.find((candidate) => candidate.segment === segment);
  if (!variance) return null;

  const roomDifference = variance.roomsSoldActual - variance.roomsSoldTarget;
  const inputs: InputRow[] = [
    row('Room nights target', formatCount(variance.roomsSoldTarget)),
    row('Room nights sold', formatCount(variance.roomsSoldActual)),
    row('Volume effect', signedEuro(variance.volumeEffect)),
    row('Share of the volume effect', formatPercent(variance.volumeEffect / drivers.volumeEffect, { decimals: 0 })),
  ];

  const cancelledBlock = overview ? findCancelledBlock(overview) : null;
  const isBiggestLoss = drivers.segments.every((candidate) => candidate.volumeEffect >= variance.volumeEffect);
  if (cancelledBlock && cancelledBlock.block.segment === segment && isBiggestLoss && roomDifference < 0) {
    const { block } = cancelledBlock;
    inputs.push(
      row('Cancelled block', block.name),
      row(`Cancelled, ${describeNights(cancelledBlock.nights)}`, `${block.roomsPerNight} × ${cancelledBlock.nightCount} = ${formatCount(cancelledBlock.cancelledRoomNights)} room nights`),
      ...(block.cancelledOn ? [row('Cancelled on', describeDate(block.cancelledOn))] : []),
    );
  }

  return {
    factId: `volume_${segment}`,
    title: `${SEGMENT_LABELS[segment]} volume`,
    displayValue: `${formatCount(roomDifference, { signDisplay: 'always' })} room nights`,
    tool: 'analyze_revenue_drivers',
    formula: '(Sold_a,s − Sold_t,s) × ADR_t',
    inputs,
    sourceQuery: `daily_stats + targets WHERE segment = '${segment}'\n${analysis.period.from} … ${analysis.period.to}`,
  };
}

function sumOver<Item>(items: readonly Item[], read: (item: Item) => number): number {
  return items.reduce((total, item) => total + read(item), 0);
}
