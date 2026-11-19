import type { Channel, ChannelCommission, DateRange, GroupBlock, Hotel, IsoDate, Segment } from '@aurora/shared';

// ---------------------------------------------------------------------------
// THE PLANTED STORY
//
// Hotel Sablon, Brussels, 111 rooms. "Today" is fixed at 17 Nov 2026, so the
// demo looks the same whenever it is opened. Month to date (1–17 Nov) room
// revenue is €33,917 below target, for four reasons the analysis must find:
//
//   1. A 3-night MICE congress (68 rooms × 10–12 Nov) was cancelled on 28 Oct.
//      Those 204 budgeted room nights were never refilled.            -> volume
//   2. Corporate is ~15% below last year. The empty rooms were sold to
//      leisure guests, who pay a lower rate than corporate and MICE.   -> mix
//   3. The extra leisure demand came through OTAs: OTA share of revenue rose
//      from ~35% to ~48%, so commissions grow faster than revenue.     -> net RevPAR
//   4. Bookings for 21–30 Nov are 16% behind last year.                -> pace
//
// The period totals below were solved so that the analytics reproduce the
// design handoff exactly: gap −€33,917 = volume −€41,932 + mix −€6,240 +
// pure price +€14,255. Everything outside the current period is plausible
// background generated with a fixed seed.
// ---------------------------------------------------------------------------

export const DEMO_RANDOM_SEED = 20261117;

export const DEMO_TODAY: IsoDate = '2026-11-17';

/** Month to date, the period of the demo question. */
export const DEMO_CURRENT_PERIOD: DateRange = { from: '2026-11-01', to: '2026-11-17' };

/** Actuals are generated from this date until DEMO_TODAY, this year and last year. */
export const DEMO_HISTORY_START: IsoDate = '2026-08-01';

export const DEMO_HOTEL: Hotel = {
  id: 'sablon-bru',
  name: 'Hotel Sablon',
  city: 'Brussels',
  roomCount: 111,
  currency: 'EUR',
  timezone: 'Europe/Brussels',
};

export const DEMO_CHANNEL_COMMISSIONS: ChannelCommission[] = [
  { channel: 'direct', name: 'Direct (web and phone)', commissionRate: 0 },
  { channel: 'ota', name: 'OTA (Booking.com, Expedia)', commissionRate: 0.18 },
  { channel: 'gds', name: 'GDS (corporate travel agents)', commissionRate: 0.08 },
  { channel: 'wholesale', name: 'Wholesale (tour operators)', commissionRate: 0.2 },
];

export interface SegmentAmounts {
  roomsBySegment: Record<Segment, number>;
  revenueBySegment: Record<Segment, number>;
}

// --- Current period, 1–17 Nov 2026 ---------------------------------------

/** Daily occupancy shape from the design (percent). The dip on 10–12 Nov is the cancelled congress. */
export const CURRENT_PERIOD_OCCUPANCY_SHAPE = [68, 71, 66, 58, 61, 70, 72, 66, 64, 40, 38, 41, 63, 67, 69, 64, 75];

export const CURRENT_PERIOD_ACTUAL: SegmentAmounts = {
  roomsBySegment: { corporate: 485, leisure: 577, group: 57, mice: 51 }, // 1,170 room nights
  revenueBySegment: { corporate: 96_445, leisure: 92_079, group: 9_120, mice: 10_616 }, // €208,260
};

export const CURRENT_PERIOD_TARGET: SegmentAmounts = {
  roomsBySegment: { corporate: 538, leisure: 552, group: 70, mice: 255 }, // 1,415 room nights
  revenueBySegment: { corporate: 101_873, leisure: 80_040, group: 10_500, mice: 49_764 }, // €242,177
};

/** Small MICE meetings that did take place (17 rooms each). */
export const CURRENT_PERIOD_MICE_ACTUAL_BY_DATE: Record<IsoDate, number> = {
  '2026-11-03': 17,
  '2026-11-04': 17,
  '2026-11-17': 17,
};

/** The budget had the same meetings plus the EU Health Congress: 68 rooms on 10, 11 and 12 Nov. */
export const CONGRESS_DATES: IsoDate[] = ['2026-11-10', '2026-11-11', '2026-11-12'];
export const CONGRESS_ROOMS_PER_NIGHT = 68;
export const CONGRESS_NAME = 'EU Health Congress';
export const CONGRESS_CANCELLED_ON: IsoDate = '2026-10-28';

/** The group blocks table: the congress this year (cancelled) and last year (it took place). */
export const DEMO_GROUP_BLOCKS: GroupBlock[] = [
  {
    id: 'eu-health-congress-2026',
    hotelId: 'sablon-bru',
    name: CONGRESS_NAME,
    segment: 'mice',
    firstNight: '2026-11-10',
    lastNight: '2026-11-12',
    roomsPerNight: CONGRESS_ROOMS_PER_NIGHT,
    status: 'cancelled',
    cancelledOn: CONGRESS_CANCELLED_ON,
  },
  {
    id: 'eu-health-congress-2025',
    hotelId: 'sablon-bru',
    name: CONGRESS_NAME,
    segment: 'mice',
    firstNight: '2025-11-10',
    lastNight: '2025-11-12',
    roomsPerNight: 50,
    status: 'confirmed',
    cancelledOn: null,
  },
];

export const CURRENT_PERIOD_MICE_TARGET_BY_DATE: Record<IsoDate, number> = {
  ...CURRENT_PERIOD_MICE_ACTUAL_BY_DATE,
  ...Object.fromEntries(CONGRESS_DATES.map((date) => [date, CONGRESS_ROOMS_PER_NIGHT])),
};

// --- Same period last year, 1–17 Nov 2025 ---------------------------------

/** Last year's occupancy shape (percent). The congress took place, so there is no dip. */
export const LAST_YEAR_PERIOD_OCCUPANCY_SHAPE = [72, 74, 70, 66, 68, 74, 76, 70, 69, 73, 75, 72, 68, 70, 72, 69, 74];

export const LAST_YEAR_PERIOD_ACTUAL: SegmentAmounts = {
  roomsBySegment: { corporate: 571, leisure: 549, group: 75, mice: 150 }, // 1,345; corporate this year is 15% lower
  revenueBySegment: { corporate: 105_635, leisure: 82_350, group: 11_100, mice: 28_500 },
};

export const LAST_YEAR_MICE_BY_DATE: Record<IsoDate, number> = {
  '2025-11-10': 50,
  '2025-11-11': 50,
  '2025-11-12': 50,
};

// --- Channel mix ----------------------------------------------------------

export type ChannelSharesBySegment = Record<Segment, Record<Channel, number>>;

/** Share of each segment's room nights per channel, last year (OTA ≈ 35% of revenue). */
export const LAST_YEAR_CHANNEL_SHARES: ChannelSharesBySegment = {
  corporate: { direct: 0.49, ota: 0.21, gds: 0.3, wholesale: 0 },
  leisure: { direct: 0.24, ota: 0.7, gds: 0, wholesale: 0.06 },
  group: { direct: 0.2, ota: 0, gds: 0, wholesale: 0.8 },
  mice: { direct: 1, ota: 0, gds: 0, wholesale: 0 },
};

/** This month (OTA ≈ 48% of revenue): corporate and leisure both moved towards OTAs. */
export const CURRENT_CHANNEL_SHARES: ChannelSharesBySegment = {
  corporate: { direct: 0.42, ota: 0.32, gds: 0.26, wholesale: 0 },
  leisure: { direct: 0.19, ota: 0.75, gds: 0, wholesale: 0.06 },
  group: { direct: 0.2, ota: 0, gds: 0, wholesale: 0.8 },
  mice: { direct: 1, ota: 0, gds: 0, wholesale: 0 },
};

/**
 * How far each 2026 month has moved from last year's mix towards this month's
 * (0 = last year, 1 = November). The OTA share creeps up over the autumn.
 */
export const OTA_SHIFT_BY_MONTH_2026: Record<number, number> = { 8: 0.1, 9: 0.25, 10: 0.55, 11: 1 };

// --- Booking pace for the rest of November --------------------------------

export interface PaceStayDatePlan {
  stayDate: IsoDate;
  roomsOnTheBooks: number;
  roomsOnTheBooksLastYear: number;
}

/** Rooms on the books on 17 Nov for each remaining night, and last year on 17 Nov 2025. 21–30 Nov: 612 vs 731. */
export const PACE_PLAN: PaceStayDatePlan[] = [
  { stayDate: '2026-11-18', roomsOnTheBooks: 74, roomsOnTheBooksLastYear: 80 },
  { stayDate: '2026-11-19', roomsOnTheBooks: 69, roomsOnTheBooksLastYear: 77 },
  { stayDate: '2026-11-20', roomsOnTheBooks: 63, roomsOnTheBooksLastYear: 70 },
  { stayDate: '2026-11-21', roomsOnTheBooks: 58, roomsOnTheBooksLastYear: 70 },
  { stayDate: '2026-11-22', roomsOnTheBooks: 64, roomsOnTheBooksLastYear: 76 },
  { stayDate: '2026-11-23', roomsOnTheBooks: 70, roomsOnTheBooksLastYear: 80 },
  { stayDate: '2026-11-24', roomsOnTheBooks: 49, roomsOnTheBooksLastYear: 62 },
  { stayDate: '2026-11-25', roomsOnTheBooks: 55, roomsOnTheBooksLastYear: 66 },
  { stayDate: '2026-11-26', roomsOnTheBooks: 62, roomsOnTheBooksLastYear: 74 },
  { stayDate: '2026-11-27', roomsOnTheBooks: 66, roomsOnTheBooksLastYear: 79 },
  { stayDate: '2026-11-28', roomsOnTheBooks: 71, roomsOnTheBooksLastYear: 84 },
  { stayDate: '2026-11-29', roomsOnTheBooks: 60, roomsOnTheBooksLastYear: 72 },
  { stayDate: '2026-11-30', roomsOnTheBooks: 57, roomsOnTheBooksLastYear: 68 },
];

/** Room nights picked up for 21–30 Nov in the 7 and 14 days before today: +38 vs +61 last year. */
export const PACE_PICKUP_FOR_LATE_NOVEMBER = {
  last7Days: 38,
  last7DaysLastYear: 61,
  last14Days: 70,
  last14DaysLastYear: 105,
};

export const PACE_AVERAGE_RATE = { thisYear: 168, lastYear: 164 };

// --- Shapes used everywhere -----------------------------------------------

/** Relative demand per day of week (0 = Sunday … 6 = Saturday) for each segment. */
export const SEGMENT_DAY_OF_WEEK_WEIGHTS: Record<Segment, number[]> = {
  corporate: [0.6, 1.3, 1.4, 1.4, 1.2, 0.8, 0.4],
  leisure: [1.0, 0.7, 0.7, 0.7, 0.8, 1.4, 1.7],
  group: [1, 1, 1, 1, 1, 1, 1],
  mice: [0.2, 1.2, 1.3, 1.3, 1.1, 0.5, 0.1],
};

/** Budgeted demand per day of week for the non-MICE segments. */
export const TARGET_DAY_OF_WEEK_WEIGHTS = [0.9, 1.0, 1.05, 1.05, 1.0, 1.0, 0.95];

/** On congress dates the budget planned fewer other guests, because 68 rooms were held for the block. */
export const CONGRESS_DISPLACEMENT_FACTOR = 0.45;

/** Rates are a little higher mid-week. */
export const DAY_OF_WEEK_RATE_FACTOR = [0.95, 1.02, 1.05, 1.05, 1.02, 0.98, 1.0];

/** OTAs sell slightly cheaper, wholesale contracts much cheaper. */
export const CHANNEL_RATE_FACTOR: Record<Channel, number> = { direct: 1, ota: 0.96, gds: 1.04, wholesale: 0.85 };

/** Background occupancy per day of week, before seasonality and noise. */
export const BACKGROUND_OCCUPANCY_BY_DAY_OF_WEEK = [0.66, 0.7, 0.76, 0.78, 0.74, 0.8, 0.82];

/** Seasonality: August is quiet in Brussels, September and October are busy. */
export const BACKGROUND_OCCUPANCY_ADJUSTMENT_BY_MONTH: Record<number, number> = { 8: -0.1, 9: 0.04, 10: 0.03, 11: 0 };

export const BACKGROUND_SEGMENT_SHARE: Record<Segment, number> = { corporate: 0.4, leisure: 0.4, group: 0.07, mice: 0.13 };

export const BACKGROUND_BASE_RATE: Record<Segment, number> = { corporate: 185, leisure: 148, group: 145, mice: 190 };
