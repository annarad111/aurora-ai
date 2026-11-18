import {
  addDays,
  calculateChannelMix,
  calculateExtraCommissionFromMixShift,
  calculateNetRevpar,
  calculateRoomsAvailable,
  calendarMonthOf,
  countNightsInRange,
  shiftRangeByYears,
  totalDailyStatsByChannel,
  type ChannelMix,
} from '@aurora/analytics';
import {
  CHANNELS,
  formatPeriodLabel,
  type Channel,
  type ChannelMixOutput,
  type DateRange,
  type PeriodToolInput,
} from '@aurora/shared';
import { totalTargets } from './get-hotel-overview';
import { requireHotel, type ToolContext } from './tool-context';

function revenueShareByChannel(mix: ChannelMix): Record<Channel, number> {
  return Object.fromEntries(
    CHANNELS.map((channel) => [channel, mix.lines.find((line) => line.channel === channel)?.revenueShare ?? 0]),
  ) as Record<Channel, number>;
}

/** The two full calendar months before the period, e.g. Sep and Oct for a November period. */
function previousTwoMonths(period: DateRange): DateRange[] {
  const previousMonth = calendarMonthOf(addDays(period.from, -1));
  const monthBefore = calendarMonthOf(addDays(previousMonth.from, -1));
  return [monthBefore, previousMonth];
}

/**
 * get_channel_mix: share of room revenue per channel, commission paid, and
 * Net RevPAR, compared with last year and the previous months.
 */
export async function getChannelMix(input: PeriodToolInput, context: ToolContext): Promise<ChannelMixOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  const { period } = input;
  const lastYearPeriod = shiftRangeByYears(period, -1);
  const roomsAvailable = calculateRoomsAvailable(hotel.roomCount, countNightsInRange(period));
  const commissions = await context.repository.listChannelCommissions();

  async function mixOf(range: DateRange): Promise<ChannelMix | null> {
    const rows = await context.repository.listDailyStats(hotel.id, range);
    if (rows.length === 0) return null;
    return calculateChannelMix(totalDailyStatsByChannel(rows), commissions);
  }

  const [currentMix, lastYearMix, targetRows] = await Promise.all([
    mixOf(period),
    mixOf(lastYearPeriod),
    context.repository.listDailyTargets(hotel.id, period),
  ]);
  // An empty period still gets a valid (all zero) mix.
  const mix = currentMix ?? calculateChannelMix(CHANNELS.map((channel) => ({ channel, roomRevenue: 0 })), commissions);
  const lastYearShares = lastYearMix ? revenueShareByChannel(lastYearMix) : revenueShareByChannel(mix);

  const comparisonRanges = [...previousTwoMonths(period), lastYearPeriod];
  const comparisonMixes = await Promise.all(comparisonRanges.map(mixOf));
  const comparisonPeriods = comparisonRanges.flatMap((range, index) => {
    const comparisonMix = comparisonMixes[index];
    if (!comparisonMix) return [];
    return [
      {
        label: formatPeriodLabel(range),
        period: range,
        revenueShareByChannel: revenueShareByChannel(comparisonMix),
        commissionShareOfRevenue: comparisonMix.commissionShareOfRevenue,
      },
    ];
  });

  // Net RevPAR target: the budgeted revenue, minus commission at last year's commission share.
  const targetRevenue = targetRows.length > 0 ? totalTargets(targetRows).roomRevenue : null;
  const netRevparTarget =
    targetRevenue !== null && lastYearMix
      ? calculateNetRevpar(targetRevenue, targetRevenue * lastYearMix.commissionShareOfRevenue, roomsAvailable)
      : null;

  return {
    period,
    roomRevenue: mix.roomRevenue,
    channels: mix.lines.map((line) => ({
      channel: line.channel,
      roomRevenue: line.roomRevenue,
      revenueShare: line.revenueShare,
      revenueShareLastYear: lastYearShares[line.channel],
      commissionRate: line.commissionRate,
      commissionCost: line.commissionCost,
    })),
    totalCommissionCost: mix.totalCommissionCost,
    commissionShareOfRevenue: mix.commissionShareOfRevenue,
    extraCommissionFromMixShift: calculateExtraCommissionFromMixShift(mix, lastYearShares),
    netRevpar: calculateNetRevpar(mix.roomRevenue, mix.totalCommissionCost, roomsAvailable),
    netRevparTarget,
    comparisonPeriods,
  };
}
