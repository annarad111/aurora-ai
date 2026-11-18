import {
  calculateRoomsAvailable,
  classifyMetricStatus,
  countNightsInRange,
  listDatesInRange,
  shiftDateByYears,
  shiftRangeByYears,
  summarizePerformance,
  sumRoomsAndRevenue,
  type PerformanceSummary,
} from '@aurora/analytics';
import {
  SEGMENTS,
  type DailyStat,
  type DailyTarget,
  type HotelOverviewOutput,
  type KpiComparison,
  type MetricId,
  type PeriodToolInput,
} from '@aurora/shared';
import { requireHotel, type ToolContext } from './tool-context';

/** The KPIs this tool reports, and where each value lives in a PerformanceSummary. */
const OVERVIEW_METRICS: Array<{ metric: MetricId; read: (summary: PerformanceSummary) => number }> = [
  { metric: 'occupancy', read: (summary) => summary.occupancy },
  { metric: 'adr', read: (summary) => summary.adr },
  { metric: 'revpar', read: (summary) => summary.revpar },
  { metric: 'room_revenue', read: (summary) => summary.roomRevenue },
  { metric: 'rooms_sold', read: (summary) => summary.roomsSold },
];

/** Target rows have the same shape as actuals once renamed, so the same KPI maths applies. */
export function totalTargets(targets: readonly DailyTarget[]): { roomsSold: number; roomRevenue: number } {
  return sumRoomsAndRevenue(targets.map((target) => ({ roomsSold: target.roomsTarget, roomRevenue: target.roomRevenueTarget })));
}

function sumRoomsSold(rows: readonly DailyStat[]): number {
  return rows.reduce((total, row) => total + row.roomsSold, 0);
}

function sumCancellations(rows: readonly DailyStat[]): number {
  return rows.reduce((total, row) => total + row.cancellations, 0);
}

/**
 * get_hotel_overview: actual vs target vs last year for the core KPIs, per
 * segment, night by night, and the group blocks of the period.
 */
export async function getHotelOverview(input: PeriodToolInput, context: ToolContext): Promise<HotelOverviewOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  const { period } = input;
  const lastYearPeriod = shiftRangeByYears(period, -1);
  const roomsAvailable = calculateRoomsAvailable(hotel.roomCount, countNightsInRange(period));

  const [actualRows, lastYearRows, targetRows, groupBlocks] = await Promise.all([
    context.repository.listDailyStats(hotel.id, period),
    context.repository.listDailyStats(hotel.id, lastYearPeriod),
    context.repository.listDailyTargets(hotel.id, period),
    context.repository.listGroupBlocks(hotel.id, period),
  ]);

  const actual = summarizePerformance(sumRoomsAndRevenue(actualRows), roomsAvailable);
  const lastYear = lastYearRows.length > 0 ? summarizePerformance(sumRoomsAndRevenue(lastYearRows), roomsAvailable) : null;
  const target = targetRows.length > 0 ? summarizePerformance(totalTargets(targetRows), roomsAvailable) : null;

  const kpis = OVERVIEW_METRICS.map(({ metric, read }): KpiComparison => {
    const actualValue = read(actual);
    const targetValue = target ? read(target) : null;
    const lastYearValue = lastYear ? read(lastYear) : null;
    return {
      metric,
      actual: actualValue,
      target: targetValue,
      lastYear: lastYearValue,
      // Judge against the target; fall back to last year when there is no budget.
      status: classifyMetricStatus(metric, actualValue, targetValue ?? lastYearValue),
    };
  });

  const segments = SEGMENTS.map((segment) => {
    const segmentActualRows = actualRows.filter((row) => row.segment === segment);
    return {
      segment,
      roomsSold: sumRoomsSold(segmentActualRows),
      roomsTarget: targetRows.filter((row) => row.segment === segment).reduce((total, row) => total + row.roomsTarget, 0),
      roomsSoldLastYear: sumRoomsSold(lastYearRows.filter((row) => row.segment === segment)),
      roomRevenue: segmentActualRows.reduce((total, row) => total + row.roomRevenue, 0),
      roomsCancelled: sumCancellations(segmentActualRows),
    };
  });

  const dailyOccupancy = listDatesInRange(period).map((date) => {
    const rowsOfDay = actualRows.filter((row) => row.date === date);
    const targetRowsOfDay = targetRows.filter((row) => row.date === date);
    const lastYearDate = shiftDateByYears(date, -1);
    return {
      date,
      occupancy: sumRoomsSold(rowsOfDay) / hotel.roomCount,
      occupancyTarget: target ? targetRowsOfDay.reduce((total, row) => total + row.roomsTarget, 0) / hotel.roomCount : null,
      occupancyLastYear: sumRoomsSold(lastYearRows.filter((row) => row.date === lastYearDate)) / hotel.roomCount,
      roomsCancelled: sumCancellations(rowsOfDay),
    };
  });

  return {
    hotel,
    period,
    roomsAvailable,
    roomsSold: actual.roomsSold,
    roomRevenue: actual.roomRevenue,
    kpis,
    segments,
    dailyOccupancy,
    groupBlocks,
  };
}
