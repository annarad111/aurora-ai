import { classifyMetricStatus } from '@aurora/analytics';
import { formatCount, formatEuro, formatPercent, SEGMENT_LABELS, type Segment, type ToolName } from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import { explainDataQuestion, explainGroupBlocks, writeDataInsight, writeGroupBlocksInsight } from './data-answers';
import { followupsForIntent } from './followups';
import {
  describeNights,
  findBiggestVolumeLoss,
  findCancelledBlock,
  findChannelLine,
  findShareShift,
  readKpi,
  relativeChange,
} from './derived-facts';
import type { InsightIntent } from './insight-plan';
import type { InsightDraft, NarrativeResult, NarrativeSegment, NarrativeWriter } from './narrative-writer';

// ---------------------------------------------------------------------------
// Deterministic templates. Every number comes from a tool result; every
// figure that matters is tagged with the fact it belongs to. Sentences adapt
// to the direction of each number (below / above, rose / fell), so the text
// stays true if the data changes.
// ---------------------------------------------------------------------------

const plain = (text: string): NarrativeSegment => ({ text });
const figure = (factId: string, text: string): NarrativeSegment => ({ text, factId });

/** Segment names inside a sentence: "corporate", "leisure", but "MICE" stays in capitals. */
function segmentInSentence(segment: Segment): string {
  return segment === 'mice' ? 'MICE' : SEGMENT_LABELS[segment].toLowerCase();
}

function requireResult<Result>(result: Result | undefined, toolName: ToolName): Result {
  if (result === undefined) throw new Error(`The narrative needs the result of ${toolName}`);
  return result;
}

export class ScriptedNarrativeWriter implements NarrativeWriter {
  headlineDependsOn(intent: InsightIntent): ToolName[] {
    const dependencies: Record<InsightIntent, ToolName[]> = {
      // The headline mentions both the cancelled block and the OTA shift.
      revenue_gap: ['get_hotel_overview', 'analyze_revenue_drivers', 'get_channel_mix'],
      channel_cost: ['get_channel_mix'],
      booking_pace: ['get_booking_pace'],
      segment_shift: ['analyze_revenue_drivers'],
      data_question: ['query_performance'],
      group_blocks: ['get_group_blocks'],
    };
    return dependencies[intent];
  }

  writeInsight(intent: InsightIntent, analysis: AnalysisContext): InsightDraft {
    switch (intent) {
      case 'revenue_gap':
        return writeRevenueGapInsight(analysis);
      case 'channel_cost':
        return writeChannelCostInsight(analysis);
      case 'booking_pace':
        return writeBookingPaceInsight(analysis);
      case 'segment_shift':
        return writeSegmentShiftInsight(analysis);
      case 'data_question':
        return writeDataInsight(analysis);
      case 'group_blocks':
        return writeGroupBlocksInsight(analysis);
    }
  }

  async writeExplanation(intent: InsightIntent, analysis: AnalysisContext): Promise<NarrativeResult> {
    const explanations: Record<InsightIntent, (context: AnalysisContext) => Iterable<NarrativeSegment>> = {
      revenue_gap: explainRevenueGap,
      channel_cost: explainChannelCost,
      booking_pace: explainBookingPace,
      segment_shift: explainSegmentShift,
      data_question: explainDataQuestion,
      group_blocks: explainGroupBlocks,
    };
    return { provider: 'scripted', segments: [...explanations[intent](analysis)] };
  }

  suggestFollowups(intent: InsightIntent, analysis: AnalysisContext): string[] {
    return followupsForIntent(intent, analysis);
  }
}

// --- "Why is my hotel revenue below target?" ---------------------------------

function writeRevenueGapInsight(analysis: AnalysisContext): InsightDraft {
  const overview = requireResult(analysis.results.overview, 'get_hotel_overview');
  const drivers = requireResult(analysis.results.drivers, 'analyze_revenue_drivers');
  const channelMix = analysis.results.channelMix;

  const biggestLoss = findBiggestVolumeLoss(drivers);
  const lostRooms = biggestLoss.roomsSoldTarget - biggestLoss.roomsSoldActual;
  const cancelledBlock = findCancelledBlock(overview);
  const gapDirection = drivers.revenueGap < 0 ? 'below' : 'above';

  const firstClause =
    cancelledBlock && cancelledBlock.block.segment === biggestLoss.segment && lostRooms > 0
      ? `The cancelled ${cancelledBlock.block.name} left ${formatCount(lostRooms)} room nights empty`
      : `Revenue is ${formatEuro(Math.abs(drivers.revenueGap))} ${gapDirection} target, mostly through ${segmentInSentence(biggestLoss.segment)} volume`;

  let secondClause = '.';
  const chips: InsightDraft['chips'] = [
    { factId: `volume_${biggestLoss.segment}`, label: `${formatCount(lostRooms)} lost room nights`, status: 'off_track' },
  ];
  const adr = readKpi(overview, 'adr');
  chips.push({ factId: 'adr', label: `ADR ${formatPercent(relativeChange(adr.actual, adr.target), { signDisplay: 'always' })}`, status: adr.status });

  if (channelMix) {
    const ota = findChannelLine(channelMix, 'ota');
    const revpar = readKpi(overview, 'revpar');
    const netRevparChange = relativeChange(channelMix.netRevpar, channelMix.netRevparTarget);
    if (ota.revenueShare > ota.revenueShareLastYear && netRevparChange < relativeChange(revpar.actual, revpar.target)) {
      secondClause = ', and the OTA shift means net revenue is falling faster than gross.';
    }
    chips.push({
      factId: 'ota_share',
      label: `OTA share ${formatPercent(ota.revenueShare, { decimals: 0 })}`,
      status: classifyMetricStatus('ota_share', ota.revenueShare, ota.revenueShareLastYear),
    });
  }

  return {
    headline: firstClause + secondClause,
    impactEur: drivers.revenueGap,
    factIds: ['revenue_gap', `volume_${biggestLoss.segment}`, ...(channelMix ? ['ota_share'] : [])],
    chips,
  };
}

function* explainRevenueGap(analysis: AnalysisContext): Iterable<NarrativeSegment> {
  const overview = requireResult(analysis.results.overview, 'get_hotel_overview');
  const drivers = requireResult(analysis.results.drivers, 'analyze_revenue_drivers');
  const { channelMix, pace } = analysis.results;

  // 1. The gap.
  yield plain('Revenue is ');
  yield figure('revenue_gap', formatEuro(Math.abs(drivers.revenueGap)));
  yield plain(` ${drivers.revenueGap < 0 ? 'below' : 'above'} target for ${describeNights(analysis.period)}. `);

  // 2. Volume, and the segment behind it.
  const roomNightDifference = drivers.segments.reduce((total, segment) => total + segment.roomsSoldActual - segment.roomsSoldTarget, 0);
  const volumeIsLargest =
    Math.abs(drivers.volumeEffect) >= Math.abs(drivers.mixEffect) && Math.abs(drivers.volumeEffect) >= Math.abs(drivers.purePriceEffect);
  yield plain(volumeIsLargest ? 'Most of the gap is volume: you sold ' : 'On volume, you sold ');
  yield figure('volume', `${formatCount(Math.abs(roomNightDifference))} ${roomNightDifference < 0 ? 'fewer' : 'more'} room nights`);
  yield plain(' than planned');

  const biggestLoss = findBiggestVolumeLoss(drivers);
  const lostRooms = biggestLoss.roomsSoldTarget - biggestLoss.roomsSoldActual;
  if (roomNightDifference < 0 && lostRooms > 0) {
    const cancelledBlock = findCancelledBlock(overview);
    yield plain(
      cancelledBlock && cancelledBlock.block.segment === biggestLoss.segment
        ? `, and the cancelled ${cancelledBlock.block.name} on ${describeNights(cancelledBlock.nights)} accounts for `
        : `, and ${segmentInSentence(biggestLoss.segment)} accounts for `,
    );
    yield figure(`volume_${biggestLoss.segment}`, `${formatCount(lostRooms)} of them`);
  }
  yield plain('. ');

  // 3. Rate and mix.
  const adr = readKpi(overview, 'adr');
  const adrChange = relativeChange(adr.actual, adr.target);
  yield plain(adrChange >= 0 ? 'Rate held up. ADR is ' : 'Rate did not help either. ADR is ');
  yield figure('adr', `${formatPercent(Math.abs(adrChange))} ${adrChange >= 0 ? 'above' : 'below'} target`);
  yield plain(drivers.purePriceEffect >= 0 ? ', worth ' : ', costing ');
  yield figure('pure_price', formatEuro(Math.abs(drivers.purePriceEffect)));
  if (drivers.mixEffect < 0) {
    const shareShift = findShareShift(drivers);
    yield plain(`, although the shift from ${segmentInSentence(shareShift.losing.segment)} to ${segmentInSentence(shareShift.gaining.segment)} took back `);
    yield figure('mix', formatEuro(Math.abs(drivers.mixEffect)));
    yield plain(' in mix. ');
  } else {
    yield plain(', and the segment mix added ');
    yield figure('mix', formatEuro(drivers.mixEffect));
    yield plain('. ');
  }

  // 4. Distribution cost: revenue is not profit.
  if (channelMix && channelMix.netRevparTarget !== null) {
    const ota = findChannelLine(channelMix, 'ota');
    const revpar = readKpi(overview, 'revpar');
    const revparChange = relativeChange(revpar.actual, revpar.target);
    const netRevparChange = relativeChange(channelMix.netRevpar, channelMix.netRevparTarget);
    const netFallsFaster = netRevparChange < revparChange;

    yield plain(netFallsFaster ? 'Profit is the weaker point. ' : '');
    yield plain(`OTA share ${ota.revenueShare >= ota.revenueShareLastYear ? 'rose' : 'fell'} from ${formatPercent(ota.revenueShareLastYear, { decimals: 0 })} to `);
    yield figure('ota_share', formatPercent(ota.revenueShare, { decimals: 0 }));
    yield plain(`, so Net RevPAR is ${netRevparChange < 0 ? 'down' : 'up'} `);
    yield figure('net_revpar', formatPercent(Math.abs(netRevparChange)));
    yield plain(`, ${netFallsFaster ? 'more' : 'less'} than the `);
    yield figure('revpar', formatPercent(Math.abs(revparChange)));
    yield plain(` ${revparChange < 0 ? 'drop' : 'rise'} in RevPAR. `);
  }

  // 5. What happens next.
  if (pace) {
    yield plain(`Pace for ${describeNights(analysis.paceWindow)} is `);
    yield figure('booking_pace', `${formatPercent(Math.abs(pace.changeVsLastYear), { decimals: 0 })} ${pace.changeVsLastYear < 0 ? 'behind' : 'ahead of'} last year`);
    yield plain(pace.changeVsLastYear < 0 ? ', so the gap will widen unless you act.' : ', which will help close the gap.');
  }
}

// --- "What are OTA commissions costing us?" ----------------------------------

function writeChannelCostInsight(analysis: AnalysisContext): InsightDraft {
  const channelMix = requireResult(analysis.results.channelMix, 'get_channel_mix');
  const ota = findChannelLine(channelMix, 'ota');
  const netRevparChange = relativeChange(channelMix.netRevpar, channelMix.netRevparTarget);
  const otaMovement = ota.revenueShare >= ota.revenueShareLastYear ? 'rose' : 'fell';

  return {
    headline:
      `Commissions take ${formatEuro(channelMix.totalCommissionCost)} this month, ` +
      `${formatPercent(channelMix.commissionShareOfRevenue)} of room revenue, because OTA share ${otaMovement} to ` +
      `${formatPercent(ota.revenueShare, { decimals: 0 })}.`,
    impactEur: -channelMix.extraCommissionFromMixShift,
    factIds: ['commission_cost', 'ota_share'],
    chips: [
      {
        factId: 'ota_share',
        label: `OTA share ${formatPercent(ota.revenueShare, { decimals: 0 })}`,
        status: classifyMetricStatus('ota_share', ota.revenueShare, ota.revenueShareLastYear),
      },
      { factId: 'commission_cost', label: `Commission ${formatEuro(channelMix.totalCommissionCost)}`, status: 'watch' },
      {
        factId: 'net_revpar',
        label: `Net RevPAR ${formatPercent(netRevparChange, { signDisplay: 'always' })}`,
        status: classifyMetricStatus('net_revpar', channelMix.netRevpar, channelMix.netRevparTarget),
      },
    ],
  };
}

function* explainChannelCost(analysis: AnalysisContext): Iterable<NarrativeSegment> {
  const overview = requireResult(analysis.results.overview, 'get_hotel_overview');
  const channelMix = requireResult(analysis.results.channelMix, 'get_channel_mix');
  const ota = findChannelLine(channelMix, 'ota');

  yield plain('OTA share of room revenue is ');
  yield figure('ota_share', formatPercent(ota.revenueShare, { decimals: 0 }));
  yield plain(`, ${ota.revenueShare >= ota.revenueShareLastYear ? 'up' : 'down'} from ${formatPercent(ota.revenueShareLastYear, { decimals: 0 })} a year ago. `);
  yield plain(`Commissions cost `);
  yield figure('commission_cost', formatEuro(channelMix.totalCommissionCost));
  yield plain(` for ${describeNights(analysis.period)}, ${formatPercent(channelMix.commissionShareOfRevenue)} of room revenue`);
  if (channelMix.extraCommissionFromMixShift > 0) {
    yield plain(', and ');
    yield figure('commission_mix_shift', formatEuro(channelMix.extraCommissionFromMixShift));
    yield plain(' of that is the extra cost of the shift towards OTAs');
  }
  yield plain('. After commissions, Net RevPAR is ');
  yield figure('net_revpar', formatEuro(channelMix.netRevpar, { decimals: 2 }));
  if (channelMix.netRevparTarget !== null) {
    const netRevparChange = relativeChange(channelMix.netRevpar, channelMix.netRevparTarget);
    yield plain(`, ${formatPercent(Math.abs(netRevparChange))} ${netRevparChange < 0 ? 'below' : 'above'} target`);
  }
  yield plain(', against a RevPAR of ');
  yield figure('revpar', formatEuro(readKpi(overview, 'revpar').actual, { decimals: 2 }));
  yield plain('.');
}

// --- "Are we on pace for the rest of the month?" ------------------------------

function writeBookingPaceInsight(analysis: AnalysisContext): InsightDraft {
  const pace = requireResult(analysis.results.pace, 'get_booking_pace');
  const overview = analysis.results.overview;
  const behind = pace.changeVsLastYear < 0;
  const slowerPickup = pace.pickupLast7Days < pace.pickupLast7DaysLastYear;
  const referenceAdr = overview ? (readKpi(overview, 'adr').target ?? readKpi(overview, 'adr').actual) : 0;

  return {
    headline:
      `Bookings for ${describeNights(analysis.paceWindow)} are ${formatPercent(Math.abs(pace.changeVsLastYear), { decimals: 0 })} ` +
      `${behind ? 'behind' : 'ahead of'} last year${slowerPickup ? ', and pickup is slower than a year ago.' : '.'}`,
    impactEur: (pace.roomsOnTheBooks - pace.roomsOnTheBooksLastYear) * referenceAdr,
    factIds: ['booking_pace', 'pace_pickup'],
    chips: [
      { factId: 'booking_pace', label: `Pace ${formatPercent(pace.changeVsLastYear, { decimals: 0, signDisplay: 'always' })}`, status: pace.status },
      {
        factId: 'pace_pickup',
        label: `Pickup ${formatCount(pace.pickupLast7Days, { signDisplay: 'always' })} vs ${formatCount(pace.pickupLast7DaysLastYear, { signDisplay: 'always' })}`,
        status: slowerPickup ? 'watch' : 'on_track',
      },
      ...(overview ? [{ factId: 'occupancy', label: `Occupancy ${formatPercent(readKpi(overview, 'occupancy').actual)}`, status: readKpi(overview, 'occupancy').status }] : []),
    ],
  };
}

function* explainBookingPace(analysis: AnalysisContext): Iterable<NarrativeSegment> {
  const pace = requireResult(analysis.results.pace, 'get_booking_pace');
  const overview = analysis.results.overview;

  yield plain(`For ${describeNights(analysis.paceWindow)} you have `);
  yield figure('booking_pace', `${formatCount(pace.roomsOnTheBooks)} room nights`);
  yield plain(
    ` on the books, ${formatPercent(Math.abs(pace.changeVsLastYear), { decimals: 0 })} ${pace.changeVsLastYear < 0 ? 'behind' : 'ahead of'} ` +
      `the same point last year (${formatCount(pace.roomsOnTheBooksLastYear)}). `,
  );
  yield plain('Pickup in the last 7 days was ');
  yield figure('pace_pickup', `${formatCount(pace.pickupLast7Days, { signDisplay: 'always' })} room nights`);
  yield plain(` against ${formatCount(pace.pickupLast7DaysLastYear, { signDisplay: 'always' })} last year`);
  yield plain(pace.pickupLast7Days < pace.pickupLast7DaysLastYear ? ', so the shortfall is growing. ' : ', so the gap is closing. ');
  if (overview) {
    const occupancy = readKpi(overview, 'occupancy');
    yield plain('Month to date, occupancy is ');
    yield figure('occupancy', formatPercent(occupancy.actual));
    yield plain(occupancy.target === null ? '.' : ` against a ${formatPercent(occupancy.target)} target.`);
  }
}

// --- "Which segment moved most?" ----------------------------------------------

function writeSegmentShiftInsight(analysis: AnalysisContext): InsightDraft {
  const drivers = requireResult(analysis.results.drivers, 'analyze_revenue_drivers');
  const segmentsByImpact = [...drivers.segments].sort((first, second) => Math.abs(second.volumeEffect) - Math.abs(first.volumeEffect));
  const [largest, second] = segmentsByImpact as [(typeof segmentsByImpact)[number], (typeof segmentsByImpact)[number]];
  const roomDifference = largest.roomsSoldActual - largest.roomsSoldTarget;

  return {
    headline:
      `${SEGMENT_LABELS[largest.segment]} moved most: ${formatCount(Math.abs(roomDifference))} room nights ` +
      `${roomDifference < 0 ? 'below' : 'above'} target, worth ${formatEuro(largest.volumeEffect, { signDisplay: 'always' })}.`,
    impactEur: largest.volumeEffect,
    factIds: [`volume_${largest.segment}`],
    chips: [
      { factId: `volume_${largest.segment}`, label: `${SEGMENT_LABELS[largest.segment]} ${formatCount(roomDifference, { signDisplay: 'always' })}`, status: roomDifference < 0 ? 'off_track' : 'on_track' },
      {
        factId: `volume_${second.segment}`,
        label: `${SEGMENT_LABELS[second.segment]} ${formatCount(second.roomsSoldActual - second.roomsSoldTarget, { signDisplay: 'always' })}`,
        status: second.volumeEffect < 0 ? 'watch' : 'on_track',
      },
      { factId: 'mix', label: `Mix ${formatEuro(drivers.mixEffect, { signDisplay: 'always' })}`, status: drivers.mixEffect < 0 ? 'watch' : 'on_track' },
    ],
  };
}

function* explainSegmentShift(analysis: AnalysisContext): Iterable<NarrativeSegment> {
  const drivers = requireResult(analysis.results.drivers, 'analyze_revenue_drivers');
  const overview = analysis.results.overview;
  const segmentsByImpact = [...drivers.segments].sort((first, second) => Math.abs(second.volumeEffect) - Math.abs(first.volumeEffect));

  yield plain(`Against target for ${describeNights(analysis.period)}, `);
  for (const [position, segment] of segmentsByImpact.entries()) {
    const roomDifference = segment.roomsSoldActual - segment.roomsSoldTarget;
    yield plain(position === 0 ? 'the biggest move is ' : position === segmentsByImpact.length - 1 ? ' and ' : ', ');
    yield plain(`${segmentInSentence(segment.segment)} at `);
    yield figure(`volume_${segment.segment}`, `${formatCount(roomDifference, { signDisplay: 'always' })} room nights`);
    yield plain(` (${formatEuro(segment.volumeEffect, { signDisplay: 'always' })})`);
  }
  yield plain('. ');

  const shareShift = findShareShift(drivers);
  yield plain(`Share of room nights moved from ${segmentInSentence(shareShift.losing.segment)} to ${segmentInSentence(shareShift.gaining.segment)}, which ${drivers.mixEffect < 0 ? 'cost' : 'added'} `);
  yield figure('mix', formatEuro(Math.abs(drivers.mixEffect)));
  yield plain(' in mix.');

  // Year-on-year context, for segments that fell sharply.
  const fallingSegments = (overview?.segments ?? []).filter(
    (segment) => segment.roomsSoldLastYear > 0 && segment.roomsSold / segment.roomsSoldLastYear - 1 <= -0.1 && segment.segment !== shareShift.losing.segment,
  );
  for (const segment of fallingSegments) {
    yield plain(` ${SEGMENT_LABELS[segment.segment]} is also ${formatPercent(Math.abs(segment.roomsSold / segment.roomsSoldLastYear - 1), { decimals: 0 })} below last year.`);
  }
}
