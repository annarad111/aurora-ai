import { buildRevenueFindings, decomposeRevenueGap, totalDailyStatsBySegment } from '@aurora/analytics';
import { SEGMENTS, type PeriodToolInput, type RevenueDriversOutput } from '@aurora/shared';
import { requireHotel, ToolInputError, type ToolContext } from './tool-context';

/**
 * analyze_revenue_drivers: splits the revenue gap vs target into volume, mix
 * and pure price, per segment, and returns the findings ranked by euro impact.
 */
export async function analyzeRevenueDrivers(input: PeriodToolInput, context: ToolContext): Promise<RevenueDriversOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  const [actualRows, targetRows] = await Promise.all([
    context.repository.listDailyStats(hotel.id, input.period),
    context.repository.listDailyTargets(hotel.id, input.period),
  ]);
  if (targetRows.length === 0) {
    throw new ToolInputError('no_data', 'There is no budget for this period, so there is no gap to analyse');
  }

  const actualBySegment = totalDailyStatsBySegment(actualRows);
  const segments = SEGMENTS.map((segment) => {
    const actual = actualBySegment.find((totals) => totals.segment === segment)!;
    const targetsOfSegment = targetRows.filter((row) => row.segment === segment);
    return {
      segment,
      roomsSoldActual: actual.roomsSold,
      roomRevenueActual: actual.roomRevenue,
      roomsSoldTarget: targetsOfSegment.reduce((total, row) => total + row.roomsTarget, 0),
      roomRevenueTarget: targetsOfSegment.reduce((total, row) => total + row.roomRevenueTarget, 0),
    };
  });

  const variance = decomposeRevenueGap(segments);

  return {
    period: input.period,
    roomRevenueActual: variance.roomRevenueActual,
    roomRevenueTarget: variance.roomRevenueTarget,
    revenueGap: variance.revenueGap,
    volumeEffect: variance.volumeEffect,
    priceEffect: variance.priceEffect,
    mixEffect: variance.mixEffect,
    purePriceEffect: variance.purePriceEffect,
    segments: variance.segments,
    findings: buildRevenueFindings(variance),
  };
}
