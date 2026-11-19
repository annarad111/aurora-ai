import { BREAKDOWN_METRIC_INFO, formatCount, formatEuroCompact, formatPercent, formatPeriodLabel, SEGMENT_LABELS, type TrailStage } from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import { describeChangeVsLastYear, queryFactId, valueOf, writeDataInsight } from './data-answers';
import { describeDate, describeNights, findBiggestVolumeLoss, findCancelledBlock, findShareShift } from './derived-facts';
import type { InsightIntent } from './insight-plan';

// ---------------------------------------------------------------------------
// The insight trail: an answer's reasoning in four short steps, for someone who
// runs the hotel, not for a developer. No tool names, no formulas:
//
//   Observation    what happened          "Revenue is €33.9k below target"
//   Discovery      the main cause          "204 room nights lost when the congress was cancelled"
//   Understanding  why it matters          "Fewer nights cost more than the higher rates brought in"
//   Decision       what to do next         "Bookings for 21–30 Nov are 16% behind" + a button
//
// Written from the tool results by fixed rules (no model), so every number is
// exact. A step whose data is missing is left out.
// ---------------------------------------------------------------------------

/** A pace this far behind last year is worth acting on. */
const PACE_WORTH_ACTING_ON = -0.03;

function percentChange(change: number): string {
  return formatPercent(Math.abs(change), { decimals: 0 });
}

/** Decision for the coming nights: act on weak pace with the what-if, or confirm pace is fine. */
function paceDecision(analysis: AnalysisContext, { repeatsPace }: { repeatsPace: boolean }): TrailStage | null {
  const { pace } = analysis.results;
  if (!pace) return null;
  const nights = describeNights({ from: pace.stayFrom, to: pace.stayTo });
  if (pace.changeVsLastYear <= PACE_WORTH_ACTING_ON) {
    return {
      stage: 'decision',
      // When the trail is about pace, the gap is already in the first step; say what can be done instead.
      text: repeatsPace
        ? `Bookings for ${nights} are ${percentChange(pace.changeVsLastYear)} behind last year: there is still time to win nights back.`
        : `These nights have not happened yet: see what winning bookings back, or moving guests to direct, would be worth.`,
      factId: 'booking_pace',
      action: { kind: 'explore', label: 'Open the what-if simulator', view: 'pace' },
    };
  }
  return {
    stage: 'decision',
    text: `Bookings for ${nights} are on pace with last year, so the focus can stay on rate.`,
    factId: 'booking_pace',
    action: { kind: 'explore', label: 'Open the what-if simulator', view: 'pace' },
  };
}

function askDecision(text: string, question: string | undefined): TrailStage {
  return question ? { stage: 'decision', text, action: { kind: 'ask', label: 'Ask this next', question } } : { stage: 'decision', text };
}

function revenueStages(intent: InsightIntent, analysis: AnalysisContext, nextQuestion: string | undefined): TrailStage[] {
  const { overview, drivers } = analysis.results;
  if (!drivers) return [];
  const stages: TrailStage[] = [];
  const gap = drivers.revenueGap;
  stages.push({
    stage: 'observation',
    text: `Room revenue is ${formatEuroCompact(Math.abs(gap))} ${gap < 0 ? 'below' : 'above'} target for ${formatPeriodLabel(analysis.period)}.`,
    factId: 'revenue_gap',
  });

  const cancelledBlock = overview ? findCancelledBlock(overview) : null;
  const biggestLoss = findBiggestVolumeLoss(drivers);
  if (cancelledBlock && cancelledBlock.cancelledRoomNights > 0) {
    stages.push({
      stage: 'discovery',
      text: `${formatCount(cancelledBlock.cancelledRoomNights)} room nights were lost when the ${cancelledBlock.block.name} on ${describeNights(cancelledBlock.nights)} was cancelled.`,
      factId: `volume_${cancelledBlock.block.segment}`,
    });
  } else if (biggestLoss.volumeEffect < 0) {
    const missingNights = biggestLoss.roomsSoldTarget - biggestLoss.roomsSoldActual;
    stages.push({
      stage: 'discovery',
      text: `${SEGMENT_LABELS[biggestLoss.segment]} sold ${formatCount(missingNights)} fewer room nights than planned.`,
      factId: `volume_${biggestLoss.segment}`,
    });
  }

  if (intent === 'segment_shift') {
    const { losing, gaining } = findShareShift(drivers);
    stages.push({
      stage: 'understanding',
      text: `${SEGMENT_LABELS[gaining.segment]} filled part of the space ${SEGMENT_LABELS[losing.segment]} left, but at a different rate, which changes the mix.`,
      factId: 'mix',
    });
  } else if (drivers.volumeEffect < 0 && drivers.purePriceEffect > 0) {
    stages.push({ stage: 'understanding', text: 'Fewer nights cost more than the higher rates brought in.', factId: 'volume' });
  } else if (drivers.volumeEffect < 0 && drivers.purePriceEffect <= 0) {
    stages.push({ stage: 'understanding', text: 'Both fewer nights and lower rates pulled revenue down.', factId: 'volume' });
  } else if (drivers.volumeEffect >= 0 && drivers.purePriceEffect < 0) {
    stages.push({ stage: 'understanding', text: 'More nights were sold, but at lower rates than planned.', factId: 'pure_price' });
  } else {
    stages.push({ stage: 'understanding', text: 'More nights and better rates both helped.', factId: 'volume' });
  }

  stages.push(paceDecision(analysis, { repeatsPace: true }) ?? askDecision('The next step is to look at what to change.', nextQuestion));
  return stages;
}

function channelStages(analysis: AnalysisContext, nextQuestion: string | undefined): TrailStage[] {
  const { channelMix } = analysis.results;
  if (!channelMix) return [];
  const ota = channelMix.channels.find((channel) => channel.channel === 'ota');
  const stages: TrailStage[] = [];
  if (ota) {
    const direction = ota.revenueShare >= ota.revenueShareLastYear ? 'up' : 'down';
    stages.push({
      stage: 'observation',
      text: `Booking sites (OTAs) bring ${formatPercent(ota.revenueShare, { decimals: 0 })} of room revenue, ${direction} from ${formatPercent(ota.revenueShareLastYear, { decimals: 0 })} last year.`,
      factId: 'ota_share',
    });
  }
  stages.push({
    stage: 'discovery',
    text: `Commissions cost ${formatEuroCompact(channelMix.totalCommissionCost)} in ${formatPeriodLabel(channelMix.period)}.`,
    factId: 'commission_cost',
  });
  stages.push(
    channelMix.extraCommissionFromMixShift > 0
      ? {
          stage: 'understanding',
          text: `Relying more on booking sites alone adds ${formatEuroCompact(channelMix.extraCommissionFromMixShift)}: revenue looks fine, but less of it stays with the hotel.`,
          factId: 'commission_mix_shift',
        }
      : { stage: 'understanding', text: 'The channel mix is not making distribution more expensive than last year.', factId: 'net_revpar' },
  );
  stages.push(askDecision('Winning more guests directly keeps more of each booking.', nextQuestion));
  return stages;
}

function paceStages(analysis: AnalysisContext): TrailStage[] {
  const { pace } = analysis.results;
  if (!pace) return [];
  const nights = describeNights({ from: pace.stayFrom, to: pace.stayTo });
  const stages: TrailStage[] = [
    {
      stage: 'observation',
      text: `${formatCount(pace.roomsOnTheBooks)} room nights are booked for ${nights}, ${percentChange(pace.changeVsLastYear)} ${pace.changeVsLastYear < 0 ? 'behind' : 'ahead of'} last year.`,
      factId: 'booking_pace',
    },
  ];
  const weakestNight = [...pace.stayDates].sort(
    (first, second) => first.roomsOnTheBooks - first.roomsOnTheBooksLastYear - (second.roomsOnTheBooks - second.roomsOnTheBooksLastYear),
  )[0];
  // With one night only, "the weakest night" would just repeat the first step.
  if (pace.stayDates.length > 1 && weakestNight && weakestNight.roomsOnTheBooks < weakestNight.roomsOnTheBooksLastYear) {
    stages.push({
      stage: 'discovery',
      text: `${describeDate(weakestNight.stayDate)} is the weakest night: ${formatCount(weakestNight.roomsOnTheBooksLastYear - weakestNight.roomsOnTheBooks)} rooms fewer than last year.`,
      factId: 'booking_pace',
    });
  }
  stages.push({
    stage: 'understanding',
    text:
      pace.pickupLast7Days < pace.pickupLast7DaysLastYear
        ? `New bookings are slower too: ${formatCount(pace.pickupLast7Days)} room nights in the last 7 days, against ${formatCount(pace.pickupLast7DaysLastYear)} last year.`
        : `New bookings are keeping up: ${formatCount(pace.pickupLast7Days)} room nights in the last 7 days, against ${formatCount(pace.pickupLast7DaysLastYear)} last year.`,
    factId: 'pace_pickup',
  });
  const decision = paceDecision(analysis, { repeatsPace: false });
  if (decision) stages.push(decision);
  return stages;
}

function dataStages(analysis: AnalysisContext, nextQuestion: string | undefined): TrailStage[] {
  const query = analysis.results.queries?.[0];
  if (!query) return [];
  const insight = writeDataInsight(analysis);
  const stages: TrailStage[] = [{ stage: 'observation', text: insight.headline, ...(insight.factIds[0] ? { factId: insight.factIds[0] } : {}) }];
  const metric = analysis.dataFocus?.primaryMetric ?? 'room_revenue';
  const { label, format } = BREAKDOWN_METRIC_INFO[metric];
  const { totals, rows } = query.output;
  if (rows.length > 1) {
    stages.push({ stage: 'discovery', text: `All of them together: ${label} ${format(valueOf(totals, metric))}.`, factId: queryFactId(0, 'total', metric) });
  }
  if (totals.lastYear) {
    stages.push({
      stage: 'understanding',
      text: `${label} is ${describeChangeVsLastYear(metric, totals, totals.lastYear)}, on the same nights.`,
      factId: queryFactId(0, 'total', metric),
    });
  }
  stages.push(askDecision('Go one level deeper, or compare with another period.', nextQuestion));
  return stages;
}

function groupBlockStages(analysis: AnalysisContext, nextQuestion: string | undefined): TrailStage[] {
  const blocks = analysis.results.groupBlocks?.blocks ?? [];
  const cancelled = blocks.filter((block) => block.status === 'cancelled');
  const stages: TrailStage[] = [
    {
      stage: 'observation',
      text: blocks.length === 0 ? 'There are no group blocks in this period.' : `${formatCount(blocks.length)} group block${blocks.length === 1 ? '' : 's'} in this period.`,
    },
  ];
  const first = cancelled[0];
  if (first) {
    stages.push({ stage: 'discovery', text: `The ${first.name} on ${describeNights({ from: first.firstNight, to: first.lastNight })} was cancelled.`, factId: `block.${first.id}` });
  }
  const confirmed = blocks.filter((block) => block.status === 'confirmed');
  if (blocks.length > 0) {
    stages.push({
      stage: 'understanding',
      text:
        confirmed.length > 0
          ? `${formatCount(confirmed.length)} confirmed block${confirmed.length === 1 ? ' is' : 's are'} still on the books.`
          : 'No confirmed group business is left in this period.',
    });
  }
  stages.push(askDecision('Replace the lost group nights with other business.', nextQuestion));
  return stages;
}

export function buildInsightTrail(intent: InsightIntent, analysis: AnalysisContext, followups: readonly string[]): TrailStage[] {
  const nextQuestion = followups[0];
  switch (intent) {
    case 'revenue_gap':
    case 'segment_shift':
      return revenueStages(intent, analysis, nextQuestion);
    case 'channel_cost':
      return channelStages(analysis, nextQuestion);
    case 'booking_pace':
      return paceStages(analysis);
    case 'data_question':
      return dataStages(analysis, nextQuestion);
    case 'group_blocks':
      return groupBlockStages(analysis, nextQuestion);
  }
}
