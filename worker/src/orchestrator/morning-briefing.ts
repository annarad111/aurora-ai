import {
  BRIEFING_PRIORITIES,
  formatCount,
  formatEuroCompact,
  formatPercent,
  formatPeriodLabel,
  SEGMENT_LABELS,
  type BookingPaceOutput,
  type BriefingInsight,
  type BriefingPriority,
  type BriefingSource,
  type ChannelMixOutput,
  type GroupBlocksOutput,
  type Hotel,
  type HotelOverviewOutput,
  type IsoDate,
  type MorningBriefing,
  type RevenueDriversOutput,
} from '@aurora/shared';
import { callTool } from '../tools/registry';
import type { ToolContext } from '../tools/tool-context';
import { monthToDate, paceWindowFor } from './analysis-context';
import { describeDate, describeNights, findBiggestVolumeLoss, findCancelledBlock, readKpi, relativeChange } from './derived-facts';

// ---------------------------------------------------------------------------
// The morning briefing: the three things that deserve attention today.
//
// Every candidate is a rule over one tool result. A rule gives its item a
// priority and a severity (how far the figure is from its baseline, as a
// fraction), and the briefing keeps the three most urgent, one per topic:
//
//   Pace         bookings for the coming nights vs last year at this point
//   Revenue      room revenue month to date vs target
//   Channels     the booking sites' share of revenue vs last year
//   Segments     a segment far short of its planned room nights
//   Groups       a cancelled group block (when Revenue does not already explain it)
//   Rate         ADR clearly above target: an opportunity to protect
//
// Ties are broken by what can still be changed: pace (future nights) first.
// Nothing here is estimated: no forecast, no money that is not in the data.
// ---------------------------------------------------------------------------

const MAXIMUM_ITEMS = 3;

/** Pace this far behind last year is critical; between the two it is important. */
const PACE_CRITICAL = -0.1;
const PACE_IMPORTANT = -0.03;
/** Pace this far ahead is an opportunity (room to hold the rate). */
const PACE_OPPORTUNITY = 0.05;

/** Revenue this far below target is critical; any shortfall beyond the tolerance is important. */
const REVENUE_CRITICAL = -0.05;
const REVENUE_IMPORTANT = -0.02;
const REVENUE_OPPORTUNITY = 0.03;

/** A rise of the booking sites' share by this much (2 points) is worth attention. */
const OTA_SHARE_RISE = 0.02;
/** A segment this far short of its planned nights is worth attention. */
const SEGMENT_SHORTFALL = -0.1;
/** ADR this far above target is an opportunity. */
const ADR_OPPORTUNITY = 0.03;

/** Order of topics when two items are equally urgent: what can still be changed comes first. */
const TOPIC_ORDER = ['Pace', 'Revenue', 'Channels', 'Segments', 'Groups', 'Rate'] as const;
type Topic = (typeof TOPIC_ORDER)[number];

interface Candidate {
  topic: Topic;
  /** How far from the baseline, as a positive fraction. Bigger is more urgent. */
  severity: number;
  insight: BriefingInsight;
  /** Findings this item already explains, so no other item repeats them. */
  explains?: string[];
  /** Left out when another chosen item explains this finding. */
  finding?: string;
}

/** Tool results the briefing reads; a missing one could not be read. */
export interface BriefingInputs {
  overview?: HotelOverviewOutput;
  drivers?: RevenueDriversOutput;
  channelMix?: ChannelMixOutput;
  pace?: BookingPaceOutput;
  groupBlocks?: GroupBlocksOutput;
}

function percent(change: number): string {
  return formatPercent(Math.abs(change), { decimals: 0 });
}

function paceCandidate(pace: BookingPaceOutput, today: IsoDate): Candidate | null {
  const change = pace.changeVsLastYear;
  let priority: BriefingPriority;
  if (change <= PACE_CRITICAL) priority = 'critical';
  else if (change <= PACE_IMPORTANT) priority = 'important';
  else if (change >= PACE_OPPORTUNITY) priority = 'opportunity';
  else return null;

  const period = { from: pace.stayFrom, to: pace.stayTo };
  const nights = describeNights(period);
  const isBehind = change < 0;
  // The weakest night is left to the investigation; the briefing stays short.
  const pickupNote =
    pace.pickupLast7Days < pace.pickupLast7DaysLastYear
      ? ` New bookings are slower too: ${formatCount(pace.pickupLast7Days)} in the last 7 days, against ${formatCount(pace.pickupLast7DaysLastYear)}.`
      : '';

  return {
    topic: 'Pace',
    severity: Math.abs(change),
    insight: {
      id: `pace:${pace.stayFrom}:${pace.stayTo}`,
      priority,
      topic: 'Booking pace',
      title: isBehind ? `Bookings for ${nights} are ${percent(change)} behind last year` : `Bookings for ${nights} are ${percent(change)} ahead of last year`,
      explanation: isBehind
        ? `${formatCount(pace.roomsOnTheBooks)} room nights are on the books, against ${formatCount(pace.roomsOnTheBooksLastYear)} at this point last year.${pickupNote} These nights can still be sold.`
        : `${formatCount(pace.roomsOnTheBooks)} room nights are on the books, against ${formatCount(pace.roomsOnTheBooksLastYear)} at this point last year. Strong demand leaves room to hold the rate.`,
      measure: {
        label: 'Room nights on the books',
        unit: 'count',
        value: pace.roomsOnTheBooks,
        baseline: pace.roomsOnTheBooksLastYear,
        baselineLabel: 'last year at this point',
        deltaStyle: 'relative_percent',
      },
      period,
      source: `Bookings on the books, counted ${describeDate(pace.snapshotDate)}`,
      sourceTool: 'get_booking_pace',
      action: {
        label: isBehind ? 'Investigate the pace' : 'Look at the pace',
        question: `Are we on pace for ${formatPeriodLabel(period)}?`,
        context: {
          origin: 'briefing',
          intent: 'booking_pace',
          insightId: `pace:${pace.stayFrom}:${pace.stayTo}`,
          metric: 'booking_pace',
          // Only future nights are a pace window; the server checks this again.
          ...(pace.stayFrom > today ? { dateRange: period } : {}),
        },
      },
    },
  };
}

function revenueCandidate(drivers: RevenueDriversOutput, overview: HotelOverviewOutput | undefined): Candidate | null {
  const change = relativeChange(drivers.roomRevenueActual, drivers.roomRevenueTarget);
  let priority: BriefingPriority;
  if (change <= REVENUE_CRITICAL) priority = 'critical';
  else if (change <= REVENUE_IMPORTANT) priority = 'important';
  else if (change >= REVENUE_OPPORTUNITY) priority = 'opportunity';
  else return null;

  const isBelow = change < 0;
  const periodLabel = formatPeriodLabel(drivers.period);
  const cancelledBlock = overview ? findCancelledBlock(overview) : null;
  const biggestLoss = findBiggestVolumeLoss(drivers);
  let cause = '';
  const explains: string[] = [];
  if (isBelow && cancelledBlock && cancelledBlock.cancelledRoomNights > 0) {
    cause = ` The cancelled ${cancelledBlock.block.name} (${describeNights(cancelledBlock.nights)}) took ${formatCount(cancelledBlock.cancelledRoomNights)} room nights.`;
    explains.push(`block:${cancelledBlock.block.id}`, `segment:${cancelledBlock.block.segment}`);
  } else if (isBelow && biggestLoss.volumeEffect < 0) {
    cause = ` ${SEGMENT_LABELS[biggestLoss.segment]} sold ${formatCount(biggestLoss.roomsSoldTarget - biggestLoss.roomsSoldActual)} fewer room nights than planned.`;
    explains.push(`segment:${biggestLoss.segment}`);
  }
  const rateNote = isBelow && drivers.purePriceEffect > 0 ? ' Higher rates made up only part of it.' : '';

  return {
    topic: 'Revenue',
    severity: Math.abs(change),
    explains,
    insight: {
      id: `revenue:${drivers.period.from}:${drivers.period.to}`,
      priority,
      topic: 'Room revenue',
      title: `Room revenue is ${formatEuroCompact(Math.abs(drivers.revenueGap))} ${isBelow ? 'below' : 'above'} target`,
      explanation: isBelow
        ? `${formatEuroCompact(drivers.roomRevenueActual)} so far this month, against a target of ${formatEuroCompact(drivers.roomRevenueTarget)}.${cause}${rateNote}`
        : `${formatEuroCompact(drivers.roomRevenueActual)} so far this month, against a target of ${formatEuroCompact(drivers.roomRevenueTarget)}.`,
      measure: {
        label: 'Room revenue',
        unit: 'currency',
        value: drivers.roomRevenueActual,
        baseline: drivers.roomRevenueTarget,
        baselineLabel: 'target',
        deltaStyle: 'relative_percent',
      },
      period: drivers.period,
      source: `Daily results and budget, ${periodLabel}`,
      sourceTool: 'analyze_revenue_drivers',
      action: {
        label: isBelow ? 'Investigate the gap' : 'See what is driving it',
        question: isBelow ? 'Why is revenue below target this month?' : 'What is driving revenue above target this month?',
        context: {
          origin: 'briefing',
          intent: 'revenue_gap',
          insightId: `revenue:${drivers.period.from}:${drivers.period.to}`,
          metric: 'room_revenue',
          dateRange: drivers.period,
        },
      },
    },
  };
}

function channelCandidate(channelMix: ChannelMixOutput): Candidate | null {
  const ota = channelMix.channels.find((channel) => channel.channel === 'ota');
  if (!ota) return null;
  const rise = ota.revenueShare - ota.revenueShareLastYear;
  if (rise < OTA_SHARE_RISE || channelMix.extraCommissionFromMixShift <= 0) return null;

  const id = `channels:${channelMix.period.from}:${channelMix.period.to}`;
  return {
    topic: 'Channels',
    // Points of share, scaled like the other fractions (4 points ≈ as urgent as 4% off target).
    severity: rise,
    insight: {
      id,
      priority: 'important',
      topic: 'Distribution',
      title: `Booking sites bring ${formatPercent(ota.revenueShare, { decimals: 0 })} of room revenue, up from ${formatPercent(ota.revenueShareLastYear, { decimals: 0 })}`,
      explanation: `Commissions cost ${formatEuroCompact(channelMix.totalCommissionCost)} this month. With last year's channel mix, the same revenue would have cost ${formatEuroCompact(channelMix.extraCommissionFromMixShift)} less.`,
      measure: {
        label: 'Booking sites (OTA) share of revenue',
        unit: 'ratio',
        value: ota.revenueShare,
        baseline: ota.revenueShareLastYear,
        baselineLabel: 'last year',
        deltaStyle: 'percentage_points',
      },
      period: channelMix.period,
      source: `Revenue and commission by channel, ${formatPeriodLabel(channelMix.period)}`,
      sourceTool: 'get_channel_mix',
      action: {
        label: 'Look at the commission cost',
        question: 'What are OTA commissions costing us this month?',
        context: { origin: 'briefing', intent: 'channel_cost', insightId: id, metric: 'ota_share', channel: 'ota', dateRange: channelMix.period },
      },
    },
  };
}

function segmentCandidate(drivers: RevenueDriversOutput): Candidate | null {
  const weakest = [...drivers.segments]
    .filter((segment) => segment.roomsSoldTarget > 0)
    .sort((first, second) => relativeChange(first.roomsSoldActual, first.roomsSoldTarget) - relativeChange(second.roomsSoldActual, second.roomsSoldTarget))[0];
  if (!weakest) return null;
  const change = relativeChange(weakest.roomsSoldActual, weakest.roomsSoldTarget);
  if (change > SEGMENT_SHORTFALL) return null;

  const label = SEGMENT_LABELS[weakest.segment];
  const id = `segment:${weakest.segment}:${drivers.period.from}:${drivers.period.to}`;
  return {
    topic: 'Segments',
    severity: Math.abs(change),
    finding: `segment:${weakest.segment}`,
    insight: {
      id,
      priority: 'important',
      topic: 'Segments',
      title: `${label} is ${percent(change)} short of its planned room nights`,
      explanation: `${formatCount(weakest.roomsSoldActual)} room nights sold so far this month, against ${formatCount(weakest.roomsSoldTarget)} planned.`,
      measure: {
        label: `${label} room nights`,
        unit: 'count',
        value: weakest.roomsSoldActual,
        baseline: weakest.roomsSoldTarget,
        baselineLabel: 'target',
        deltaStyle: 'relative_percent',
      },
      period: drivers.period,
      source: `Daily results and budget by segment, ${formatPeriodLabel(drivers.period)}`,
      sourceTool: 'analyze_revenue_drivers',
      action: {
        label: 'See which segments moved',
        question: `Which segments replaced the lost ${label} nights?`,
        context: { origin: 'briefing', intent: 'segment_shift', insightId: id, metric: 'rooms_sold', segment: weakest.segment, dateRange: drivers.period },
      },
    },
  };
}

function groupBlockCandidate(groupBlocks: GroupBlocksOutput): Candidate | null {
  const cancelled = groupBlocks.blocks.filter((block) => block.status === 'cancelled');
  const block = cancelled.sort((first, second) => second.roomsPerNight - first.roomsPerNight)[0];
  if (!block) return null;
  const nights = { from: block.firstNight, to: block.lastNight };
  const id = `block:${block.id}`;
  const roomNights = block.roomsPerNight * (Math.round((Date.parse(block.lastNight) - Date.parse(block.firstNight)) / 86_400_000) + 1);
  return {
    topic: 'Groups',
    // A cancellation is a fact, not a gap from a baseline: ranked as a moderate, important item.
    severity: 0.05,
    finding: id,
    insight: {
      id,
      priority: 'important',
      topic: 'Group blocks',
      title: `The ${block.name} was cancelled`,
      explanation: `${formatCount(block.roomsPerNight)} rooms a night on ${describeNights(nights)}: ${formatCount(roomNights)} room nights to replace.`,
      measure: {
        label: 'Rooms a night in the block',
        unit: 'count',
        value: 0,
        baseline: block.roomsPerNight,
        baselineLabel: 'blocked',
        deltaStyle: 'relative_percent',
      },
      period: nights,
      source: 'Group blocks',
      sourceTool: 'get_group_blocks',
      action: {
        label: 'Check the other blocks',
        question: 'Are other group blocks at risk this quarter?',
        context: { origin: 'briefing', intent: 'group_blocks', insightId: id, segment: block.segment, dateRange: groupBlocks.period },
      },
    },
  };
}

function rateCandidate(overview: HotelOverviewOutput): Candidate | null {
  const adr = readKpi(overview, 'adr');
  if (adr.target === null) return null;
  const change = relativeChange(adr.actual, adr.target);
  if (change < ADR_OPPORTUNITY) return null;
  const id = `adr:${overview.period.from}:${overview.period.to}`;
  return {
    topic: 'Rate',
    severity: change,
    insight: {
      id,
      priority: 'opportunity',
      topic: 'Rate',
      title: `Average rate is ${percent(change)} above target`,
      explanation: `Guests pay ${formatEuroCompact(adr.actual)} a night on average, against a target of ${formatEuroCompact(adr.target)}. The rate is holding up, even where volume is short.`,
      measure: { label: 'ADR', unit: 'currency', value: adr.actual, baseline: adr.target, baselineLabel: 'target', deltaStyle: 'relative_percent' },
      period: overview.period,
      source: `Daily results and budget, ${formatPeriodLabel(overview.period)}`,
      sourceTool: 'get_hotel_overview',
      action: {
        label: 'See what is behind it',
        question: 'Which segments moved most this month?',
        context: { origin: 'briefing', intent: 'segment_shift', insightId: id, metric: 'adr', dateRange: overview.period },
      },
    },
  };
}

/** Most urgent first: priority, then severity, then the topic order. */
function compareCandidates(first: Candidate, second: Candidate): number {
  const byPriority = BRIEFING_PRIORITIES.indexOf(first.insight.priority) - BRIEFING_PRIORITIES.indexOf(second.insight.priority);
  if (byPriority !== 0) return byPriority;
  const bySeverity = second.severity - first.severity;
  if (Math.abs(bySeverity) > 0.005) return bySeverity;
  return TOPIC_ORDER.indexOf(first.topic) - TOPIC_ORDER.indexOf(second.topic);
}

/** Ranks the candidates and keeps the three most urgent, without two items saying the same thing. */
export function rankBriefingItems(inputs: BriefingInputs, today: IsoDate): BriefingInsight[] {
  const candidates = [
    inputs.pace ? paceCandidate(inputs.pace, today) : null,
    inputs.drivers ? revenueCandidate(inputs.drivers, inputs.overview) : null,
    inputs.channelMix ? channelCandidate(inputs.channelMix) : null,
    inputs.drivers ? segmentCandidate(inputs.drivers) : null,
    inputs.groupBlocks ? groupBlockCandidate(inputs.groupBlocks) : null,
    inputs.overview ? rateCandidate(inputs.overview) : null,
  ].filter((candidate): candidate is Candidate => candidate !== null);

  const chosen: Candidate[] = [];
  const explained = new Set<string>();
  for (const candidate of candidates.sort(compareCandidates)) {
    if (chosen.length === MAXIMUM_ITEMS) break;
    if (candidate.finding && explained.has(candidate.finding)) continue;
    chosen.push(candidate);
    for (const finding of candidate.explains ?? []) explained.add(finding);
  }
  return chosen.map((candidate) => candidate.insight);
}

/** Reads one tool; a failure leaves the source out instead of failing the whole briefing. */
async function readSource<Output>(source: BriefingSource, read: () => Promise<Output>, unavailable: BriefingSource[]): Promise<Output | undefined> {
  try {
    return await read();
  } catch (error) {
    console.warn(`[Aurora] briefing could not read ${source}:`, error instanceof Error ? error.message : error);
    unavailable.push(source);
    return undefined;
  }
}

export async function buildMorningBriefing(context: ToolContext, hotel: Hotel, today: IsoDate = context.today): Promise<MorningBriefing> {
  const period = monthToDate(today);
  const paceWindow = paceWindowFor(today);
  const hotelId = hotel.id;
  const unavailable: BriefingSource[] = [];

  const [overview, drivers, channelMix, pace, groupBlocks] = await Promise.all([
    readSource('performance', () => callTool('get_hotel_overview', { hotelId, period }, context), unavailable),
    readSource('revenue_drivers', () => callTool('analyze_revenue_drivers', { hotelId, period }, context), unavailable),
    readSource('channels', () => callTool('get_channel_mix', { hotelId, period }, context), unavailable),
    readSource('booking_pace', () => callTool('get_booking_pace', { hotelId, stayFrom: paceWindow.from, stayTo: paceWindow.to }, context), unavailable),
    readSource('group_blocks', () => callTool('get_group_blocks', { hotelId, period }, context), unavailable),
  ]);

  return {
    hotelId,
    hotelName: hotel.name,
    reportDate: today,
    dataThrough: overview?.period.to ?? drivers?.period.to ?? null,
    bookingsSnapshotDate: pace?.snapshotDate ?? null,
    insights: rankBriefingItems({ overview, drivers, channelMix, pace, groupBlocks }, today),
    unavailableSources: unavailable,
  };
}
