import {
  CHANNEL_LABELS,
  CHANNELS,
  SEGMENT_LABELS,
  SEGMENTS,
  type BreakdownDimension,
  type ChannelCommission,
  type DailyStat,
  type DateRange,
  type DayType,
  type IsoDate,
  type PerformanceValues,
} from '@aurora/shared';
import { dayOfWeek, listDatesInRange } from './dates';
import { calculateAdr, calculateNetRevpar, calculateOccupancy, calculateRevpar } from './kpi';

// ---------------------------------------------------------------------------
// Performance broken down along one dimension: the engine behind free-form
// data questions ("ADR on weekends by channel", "occupancy on 5 November").
//
// Rooms available per row:
//   whole period, a night, a weekday, weekend/weekday  → rooms × the nights in that row
//   a segment or a channel                             → rooms × all nights of the period
// so segment and channel occupancy are each segment's share of the whole
// hotel, and they add up to the hotel's occupancy.
// ---------------------------------------------------------------------------

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Hotel convention: Friday and Saturday nights are the weekend. */
const WEEKEND_DAYS_OF_WEEK = [5, 6];

export function dayTypeOf(date: IsoDate): DayType {
  return WEEKEND_DAYS_OF_WEEK.includes(dayOfWeek(date)) ? 'weekend' : 'weekday';
}

export interface BreakdownOptions {
  period: DateRange;
  roomCount: number;
  dimension: BreakdownDimension;
  commissions: readonly ChannelCommission[];
  /** Only nights of this type count (rows and rooms available). */
  dayType?: DayType;
}

export interface BreakdownRowValues extends PerformanceValues {
  key: string;
  label: string;
}

/** The nights of the period that the query covers (all, or only weekend / weekday nights). */
export function listCoveredNights(period: DateRange, dayType?: DayType): IsoDate[] {
  const nights = listDatesInRange(period);
  return dayType ? nights.filter((night) => dayTypeOf(night) === dayType) : nights;
}

/** Turns rows of daily stats into the metrics of one row. */
export function summarizeRows(rows: readonly DailyStat[], nights: number, roomCount: number, commissionRateByChannel: Map<string, number>): PerformanceValues {
  const roomsSold = rows.reduce((total, row) => total + row.roomsSold, 0);
  const roomRevenue = rows.reduce((total, row) => total + row.roomRevenue, 0);
  const cancellations = rows.reduce((total, row) => total + row.cancellations, 0);
  const commissionCost = rows.reduce((total, row) => total + row.roomRevenue * (commissionRateByChannel.get(row.channel) ?? 0), 0);
  const roomsAvailable = roomCount * nights;
  return {
    nights,
    roomsAvailable,
    roomsSold,
    roomRevenue,
    cancellations,
    commissionCost,
    occupancy: calculateOccupancy(roomsSold, roomsAvailable),
    adr: calculateAdr(roomRevenue, roomsSold),
    revpar: calculateRevpar(roomRevenue, roomsAvailable),
    netRevpar: calculateNetRevpar(roomRevenue, commissionCost, roomsAvailable),
  };
}

/** One row per value of the dimension, in a fixed, meaningful order. */
export function breakDownPerformance(dailyStats: readonly DailyStat[], options: BreakdownOptions): BreakdownRowValues[] {
  const coveredNights = listCoveredNights(options.period, options.dayType);
  const covered = new Set(coveredNights);
  const rows = dailyStats.filter((row) => covered.has(row.date));
  const rates = new Map(options.commissions.map((commission) => [commission.channel, commission.commissionRate]));
  const summarize = (subset: readonly DailyStat[], nights: number) => summarizeRows(subset, nights, options.roomCount, rates);

  switch (options.dimension) {
    case 'none':
      return [{ key: 'total', label: 'Total', ...summarize(rows, coveredNights.length) }];

    case 'day':
      return coveredNights.map((night) => ({
        key: night,
        label: night,
        ...summarize(
          rows.filter((row) => row.date === night),
          1,
        ),
      }));

    case 'weekday': {
      // Monday first, as in a hotel's weekly report; only weekdays that occur in the period.
      const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
      return mondayFirst.flatMap((weekday) => {
        const nightsOfWeekday = coveredNights.filter((night) => dayOfWeek(night) === weekday);
        if (nightsOfWeekday.length === 0) return [];
        const nightSet = new Set(nightsOfWeekday);
        return [{ key: WEEKDAY_KEYS[weekday]!, label: WEEKDAY_LABELS[weekday]!, ...summarize(rows.filter((row) => nightSet.has(row.date)), nightsOfWeekday.length) }];
      });
    }

    case 'day_type':
      return (['weekend', 'weekday'] as const).flatMap((dayType) => {
        const nightsOfType = coveredNights.filter((night) => dayTypeOf(night) === dayType);
        if (nightsOfType.length === 0) return [];
        const nightSet = new Set(nightsOfType);
        return [
          {
            key: dayType,
            label: dayType === 'weekend' ? 'Weekend (Fri–Sat nights)' : 'Weekday (Sun–Thu nights)',
            ...summarize(rows.filter((row) => nightSet.has(row.date)), nightsOfType.length),
          },
        ];
      });

    case 'segment':
      return SEGMENTS.map((segment) => ({
        key: segment,
        label: SEGMENT_LABELS[segment],
        ...summarize(
          rows.filter((row) => row.segment === segment),
          coveredNights.length,
        ),
      }));

    case 'channel':
      return CHANNELS.map((channel) => ({
        key: channel,
        label: CHANNEL_LABELS[channel],
        ...summarize(
          rows.filter((row) => row.channel === channel),
          coveredNights.length,
        ),
      }));
  }
}
