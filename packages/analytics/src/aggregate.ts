import { CHANNELS, SEGMENTS, type Channel, type DailyStat, type DateRange, type Segment } from '@aurora/shared';
import { isDateInRange } from './dates';
import { sumRoomsAndRevenue, type RoomsAndRevenue } from './kpi';

// Helpers that turn raw daily_stats rows into totals. They always return every
// segment / channel in a fixed order (even with zero rooms), so charts and
// tables stay stable from one run to the next.

export function filterDailyStatsByPeriod(dailyStats: readonly DailyStat[], period: DateRange): DailyStat[] {
  return dailyStats.filter((dailyStat) => isDateInRange(dailyStat.date, period));
}

export interface SegmentTotals extends RoomsAndRevenue {
  segment: Segment;
}

export function totalDailyStatsBySegment(dailyStats: readonly DailyStat[]): SegmentTotals[] {
  return SEGMENTS.map((segment) => ({
    segment,
    ...sumRoomsAndRevenue(dailyStats.filter((dailyStat) => dailyStat.segment === segment)),
  }));
}

export interface ChannelTotals extends RoomsAndRevenue {
  channel: Channel;
}

export function totalDailyStatsByChannel(dailyStats: readonly DailyStat[]): ChannelTotals[] {
  return CHANNELS.map((channel) => ({
    channel,
    ...sumRoomsAndRevenue(dailyStats.filter((dailyStat) => dailyStat.channel === channel)),
  }));
}
