import { formatCount, formatEuro, formatPercent, formatPercentagePoints, SEGMENT_LABELS, type Segment } from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import {
  countCancelledRoomsIn,
  describeNights,
  findBiggestVolumeLoss,
  findCancelledBlock,
  findChannelLine,
  findShareShift,
  readKpi,
  relativeChange,
} from './derived-facts';

// ---------------------------------------------------------------------------
// The contextual insight card: what a figure means, in one or two sentences.
// Shown when the user clicks a figure, chip or KPI. Like the narrative, it is
// written only from tool output, so every number in it is traceable.
// ---------------------------------------------------------------------------

export interface ContextNote {
  contextLabel: string;
  contextText: string;
}

const signedEuro = (amount: number) => formatEuro(amount, { signDisplay: 'always' });
const wholePercent = (ratio: number) => formatPercent(ratio, { decimals: 0 });

function segmentInSentence(segment: Segment): string {
  return segment === 'mice' ? 'MICE' : SEGMENT_LABELS[segment].toLowerCase();
}

/** "38–41%" (or "40%" when all nights are the same). */
function describePercentRange(values: number[]): string {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  return wholePercent(lowest) === wholePercent(highest) ? wholePercent(lowest) : `${wholePercent(lowest).replace('%', '')}–${wholePercent(highest)}`;
}

/** Occupancy on the cancelled-block nights, and for the rest of the period without them. */
function describeCancelledBlock(analysis: AnalysisContext) {
  const overview = analysis.results.overview;
  if (!overview) return null;
  const blockRange = findCancelledBlock(overview);
  if (!blockRange) return null;

  const blockNights = overview.dailyOccupancy.filter((night) => night.date >= blockRange.from && night.date <= blockRange.to);
  const otherNights = overview.dailyOccupancy.filter((night) => night.date < blockRange.from || night.date > blockRange.to);
  const average = (values: number[]) => values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
  const targetsKnown = overview.dailyOccupancy.every((night) => night.occupancyTarget !== null);

  return {
    blockRange,
    cancelledRooms: countCancelledRoomsIn(overview, blockRange),
    occupancyOnBlockNights: blockNights.map((night) => night.occupancy),
    targetOnBlockNights: targetsKnown ? blockNights.map((night) => night.occupancyTarget ?? 0) : null,
    occupancyWithoutBlock: average(otherNights.map((night) => night.occupancy)),
    targetWithoutBlock: targetsKnown ? average(otherNights.map((night) => night.occupancyTarget ?? 0)) : null,
  };
}

export function buildContextNote(factId: string, analysis: AnalysisContext): ContextNote | null {
  const { overview, drivers, channelMix, pace } = analysis.results;

  if (factId.startsWith('volume_') && drivers) {
    const segment = factId.slice('volume_'.length) as Segment;
    const variance = drivers.segments.find((candidate) => candidate.segment === segment);
    if (!variance) return null;
    const roomDifference = variance.roomsSoldActual - variance.roomsSoldTarget;
    const isBiggestLoss = findBiggestVolumeLoss(drivers).segment === segment && roomDifference < 0;
    const block = isBiggestLoss ? describeCancelledBlock(analysis) : null;

    if (block) {
      const targetText = block.targetOnBlockNights ? ` against a ${describePercentRange(block.targetOnBlockNights)} target` : '';
      return {
        contextLabel: `${formatCount(Math.abs(roomDifference))} lost room nights`,
        contextText:
          `The ${segmentInSentence(segment)} shortfall sits on ${describeNights(block.blockRange)}: ${formatCount(block.cancelledRooms)} room nights were cancelled for those nights and never resold. ` +
          `Occupancy on those nights fell to ${describePercentRange(block.occupancyOnBlockNights)}${targetText}.`,
      };
    }
    return {
      contextLabel: `${SEGMENT_LABELS[segment]} ${formatCount(roomDifference, { signDisplay: 'always' })} room nights`,
      contextText:
        `${SEGMENT_LABELS[segment]} sold ${formatCount(variance.roomsSoldActual)} room nights against ${formatCount(variance.roomsSoldTarget)} planned, ` +
        `which is worth ${signedEuro(variance.volumeEffect)} of revenue at the target rate.`,
    };
  }

  switch (factId) {
    case 'revenue_gap':
      if (!drivers) return null;
      return {
        contextLabel: `${formatEuro(drivers.revenueGap)} vs target`,
        contextText: `Volume ${signedEuro(drivers.volumeEffect)}, mix ${signedEuro(drivers.mixEffect)} and price ${signedEuro(drivers.purePriceEffect)} add up to the full gap.`,
      };

    case 'volume': {
      if (!drivers) return null;
      const biggestLoss = findBiggestVolumeLoss(drivers);
      const shareOfVolume = biggestLoss.volumeEffect / drivers.volumeEffect;
      return {
        contextLabel: `${formatCount(Math.abs(drivers.segments.reduce((total, segment) => total + segment.roomsSoldActual - segment.roomsSoldTarget, 0)))} fewer room nights`,
        contextText:
          `Volume explains ${signedEuro(drivers.volumeEffect)} of the gap. ` +
          `${SEGMENT_LABELS[biggestLoss.segment]} accounts for ${wholePercent(shareOfVolume)} of it; the rest is spread across the other segments.`,
      };
    }

    case 'occupancy': {
      if (!overview) return null;
      const occupancy = readKpi(overview, 'occupancy');
      const block = describeCancelledBlock(analysis);
      const shortfallText =
        occupancy.target === null ? '' : `Occupancy is ${formatPercentagePoints(occupancy.actual - occupancy.target).replace('−', '')} below target. `;
      const withoutBlockText =
        block && block.targetWithoutBlock !== null
          ? `Without ${describeNights(block.blockRange)} it would be ${formatPercent(block.occupancyWithoutBlock)}, against ${formatPercent(block.targetWithoutBlock)} planned for those nights.`
          : '';
      return { contextLabel: `Occupancy ${formatPercent(occupancy.actual)}`, contextText: `${shortfallText}${withoutBlockText}`.trim() };
    }

    case 'adr':
    case 'pure_price':
    case 'price_effect': {
      if (!overview || !drivers) return null;
      const adr = readKpi(overview, 'adr');
      const adrDifference = adr.target === null ? 0 : adr.actual - adr.target;
      const label =
        factId === 'adr'
          ? `ADR ${formatPercent(relativeChange(adr.actual, adr.target), { signDisplay: 'always' })}`
          : factId === 'pure_price'
            ? `Price ${signedEuro(drivers.purePriceEffect)}`
            : `Price effect ${signedEuro(drivers.priceEffect)}`;
      return {
        contextLabel: label,
        contextText:
          `${adrDifference >= 0 ? 'Rate is holding.' : 'Rate is below plan.'} ADR is ${formatEuro(Math.abs(adrDifference), { decimals: 2 })} ` +
          `${adrDifference >= 0 ? 'above' : 'below'} target, worth ${signedEuro(drivers.purePriceEffect)} before the segment mix ` +
          `${drivers.mixEffect < 0 ? 'took back' : 'added'} ${formatEuro(Math.abs(drivers.mixEffect))}, a net ${signedEuro(drivers.priceEffect)}.`,
      };
    }

    case 'mix': {
      if (!drivers) return null;
      const { gaining, losing } = findShareShift(drivers);
      return {
        contextLabel: `Mix ${signedEuro(drivers.mixEffect)}`,
        contextText:
          `${SEGMENT_LABELS[gaining.segment]} grew to ${wholePercent(gaining.shareOfRoomsActual)} of room nights against ${wholePercent(gaining.shareOfRoomsTarget)} planned, ` +
          `while ${segmentInSentence(losing.segment)} fell to ${wholePercent(losing.shareOfRoomsActual)} against ${wholePercent(losing.shareOfRoomsTarget)}. ` +
          `${SEGMENT_LABELS[gaining.segment]} is budgeted at ${formatEuro(gaining.adrTarget, { decimals: 2 })} a night against ${formatEuro(losing.adrTarget, { decimals: 2 })} for ${segmentInSentence(losing.segment)}, which cost ${formatEuro(Math.abs(drivers.mixEffect))}.`,
      };
    }

    case 'revpar': {
      if (!overview) return null;
      const revpar = readKpi(overview, 'revpar');
      const adr = readKpi(overview, 'adr');
      const adrAboveTarget = adr.target !== null && adr.actual >= adr.target;
      return {
        contextLabel: `RevPAR ${formatPercent(relativeChange(revpar.actual, revpar.target), { signDisplay: 'always' })}`,
        contextText:
          `RevPAR is ${formatEuro(revpar.actual, { decimals: 2 })}` +
          (revpar.target === null ? '.' : ` against a ${formatEuro(revpar.target, { decimals: 2 })} target. `) +
          (adrAboveTarget ? 'The drop comes from occupancy, since ADR is above target.' : 'Both occupancy and rate are below plan.'),
      };
    }

    case 'ota_share':
    case 'commission_cost':
    case 'commission_mix_shift': {
      if (!channelMix) return null;
      const ota = findChannelLine(channelMix, 'ota');
      const labels = {
        ota_share: `OTA share ${wholePercent(ota.revenueShare)}`,
        commission_cost: `Commission ${formatEuro(channelMix.totalCommissionCost)}`,
        commission_mix_shift: `Channel shift ${formatEuro(channelMix.extraCommissionFromMixShift)}`,
      };
      return {
        contextLabel: labels[factId],
        contextText:
          `OTAs bring ${wholePercent(ota.revenueShare)} of room revenue, against ${wholePercent(ota.revenueShareLastYear)} last year. ` +
          `Commissions cost ${formatEuro(channelMix.totalCommissionCost)} (${formatPercent(channelMix.commissionShareOfRevenue)} of revenue), ` +
          `${formatEuro(channelMix.extraCommissionFromMixShift)} more than last year's channel mix would have cost.`,
      };
    }

    case 'net_revpar': {
      if (!channelMix || !overview) return null;
      const revpar = readKpi(overview, 'revpar');
      const netChange = relativeChange(channelMix.netRevpar, channelMix.netRevparTarget);
      const fallsFaster = netChange < relativeChange(revpar.actual, revpar.target);
      return {
        contextLabel: `Net RevPAR ${formatPercent(netChange, { signDisplay: 'always' })}`,
        contextText:
          `After ${formatEuro(channelMix.totalCommissionCost)} in commissions, Net RevPAR is ${formatEuro(channelMix.netRevpar, { decimals: 2 })}. ` +
          (fallsFaster ? 'It falls faster than RevPAR because more revenue comes through OTAs.' : 'It moves in line with RevPAR.'),
      };
    }

    case 'booking_pace':
    case 'pace_pickup':
      if (!pace) return null;
      return {
        contextLabel: factId === 'booking_pace' ? `Pace ${formatPercent(pace.changeVsLastYear, { decimals: 0, signDisplay: 'always' })}` : `Pickup ${formatCount(pace.pickupLast7Days, { signDisplay: 'always' })}`,
        contextText:
          `${formatCount(pace.roomsOnTheBooks)} room nights are on the books for ${describeNights(analysis.paceWindow)}, ` +
          `against ${formatCount(pace.roomsOnTheBooksLastYear)} at this point last year. ` +
          `Pickup in the last 7 days was ${formatCount(pace.pickupLast7Days, { signDisplay: 'always' })} vs ${formatCount(pace.pickupLast7DaysLastYear, { signDisplay: 'always' })}.`,
      };

    default:
      return null;
  }
}
