import { addDays, dayOfWeek, listDatesInRange, shiftDateByYears } from '@aurora/analytics';
import {
  CHANNELS,
  SEGMENTS,
  type Channel,
  type ChannelCommission,
  type DailyStat,
  type DailyTarget,
  type GroupBlock,
  type Hotel,
  type IsoDate,
  type OnTheBooks,
  type PropertyProfile,
  type Room,
  type RoomStatusEvent,
  type Segment,
} from '@aurora/shared';
import { allocateByLargestRemainder, balanceIntegerMatrix } from './allocate';
import { DEMO_PROPERTY_PROFILE, DEMO_ROOM_STATUS_EVENTS, generateDemoRooms } from './property';
import { createSeededRandom, type SeededRandom } from './seeded-random';
import {
  BACKGROUND_BASE_RATE,
  BACKGROUND_OCCUPANCY_ADJUSTMENT_BY_MONTH,
  BACKGROUND_OCCUPANCY_BY_DAY_OF_WEEK,
  BACKGROUND_SEGMENT_SHARE,
  CHANNEL_RATE_FACTOR,
  CONGRESS_DATES,
  CONGRESS_DISPLACEMENT_FACTOR,
  CONGRESS_ROOMS_PER_NIGHT,
  CURRENT_CHANNEL_SHARES,
  CURRENT_PERIOD_ACTUAL,
  CURRENT_PERIOD_MICE_ACTUAL_BY_DATE,
  CURRENT_PERIOD_MICE_TARGET_BY_DATE,
  CURRENT_PERIOD_OCCUPANCY_SHAPE,
  CURRENT_PERIOD_TARGET,
  DAY_OF_WEEK_RATE_FACTOR,
  DEMO_CHANNEL_COMMISSIONS,
  DEMO_CURRENT_PERIOD,
  DEMO_GROUP_BLOCKS,
  DEMO_HISTORY_START,
  DEMO_HOTEL,
  DEMO_RANDOM_SEED,
  DEMO_TODAY,
  LAST_YEAR_CHANNEL_SHARES,
  LAST_YEAR_MICE_BY_DATE,
  LAST_YEAR_PERIOD_ACTUAL,
  LAST_YEAR_PERIOD_OCCUPANCY_SHAPE,
  OTA_SHIFT_BY_MONTH_2026,
  PACE_AVERAGE_RATE,
  PACE_PICKUP_FOR_LATE_NOVEMBER,
  PACE_PLAN,
  SEGMENT_DAY_OF_WEEK_WEIGHTS,
  TARGET_DAY_OF_WEEK_WEIGHTS,
  type ChannelSharesBySegment,
  type SegmentAmounts,
} from './story';

export interface DemoDataset {
  hotels: Hotel[];
  channelCommissions: ChannelCommission[];
  dailyStats: DailyStat[];
  dailyTargets: DailyTarget[];
  onTheBooks: OnTheBooks[];
  groupBlocks: GroupBlock[];
  /** Fictional property details, rooms and maintenance (see property.ts). */
  propertyProfiles: PropertyProfile[];
  rooms: Room[];
  roomStatusEvents: RoomStatusEvent[];
}

const NON_MICE_SEGMENTS = ['corporate', 'leisure', 'group'] as const satisfies readonly Segment[];

/** Room nights for one day, segment and channel, before revenue is attached. */
interface RoomDraft {
  date: IsoDate;
  segment: Segment;
  channel: Channel;
  roomsSold: number;
}

/**
 * Builds the whole demo dataset. Pure and deterministic: no clock, no I/O,
 * the same output on every call.
 */
export function generateDemoDataset(): DemoDataset {
  const random = createSeededRandom(DEMO_RANDOM_SEED);
  const hotelId = DEMO_HOTEL.id;

  const dailyStats: DailyStat[] = [];
  const dailyTargets: DailyTarget[] = [];

  // 1. Background months, this year (with budget) and last year.
  const backgroundEnd = addDays(DEMO_CURRENT_PERIOD.from, -1);
  for (const date of listDatesInRange({ from: DEMO_HISTORY_START, to: backgroundEnd })) {
    const month = Number(date.slice(5, 7));
    const backgroundDay = generateBackgroundDay({ date, hotelId, otaShift: OTA_SHIFT_BY_MONTH_2026[month] ?? 0, rateLevel: 1, random });
    dailyStats.push(...backgroundDay.dailyStats);
    dailyTargets.push(...backgroundDay.dailyTargets);
  }
  for (const date of listDatesInRange({ from: shiftDateByYears(DEMO_HISTORY_START, -1), to: shiftDateByYears(backgroundEnd, -1) })) {
    dailyStats.push(...generateBackgroundDay({ date, hotelId, otaShift: 0, rateLevel: 0.97, random }).dailyStats);
  }

  // 2. The story period, with exact totals.
  const currentPeriodDates = listDatesInRange(DEMO_CURRENT_PERIOD);
  dailyStats.push(
    ...generateExactPeriodStats({
      hotelId,
      dates: currentPeriodDates,
      occupancyShape: CURRENT_PERIOD_OCCUPANCY_SHAPE,
      amounts: CURRENT_PERIOD_ACTUAL,
      miceRoomsByDate: CURRENT_PERIOD_MICE_ACTUAL_BY_DATE,
      channelShares: CURRENT_CHANNEL_SHARES,
      cancelledMiceRoomsByDate: Object.fromEntries(CONGRESS_DATES.map((date) => [date, CONGRESS_ROOMS_PER_NIGHT])),
      random,
    }),
  );
  dailyTargets.push(
    ...generateExactPeriodTargets({
      hotelId,
      dates: currentPeriodDates,
      amounts: CURRENT_PERIOD_TARGET,
      miceRoomsByDate: CURRENT_PERIOD_MICE_TARGET_BY_DATE,
      displacedDates: CONGRESS_DATES,
    }),
  );

  // 3. The same period last year, also exact.
  dailyStats.push(
    ...generateExactPeriodStats({
      hotelId,
      dates: currentPeriodDates.map((date) => shiftDateByYears(date, -1)),
      occupancyShape: LAST_YEAR_PERIOD_OCCUPANCY_SHAPE,
      amounts: LAST_YEAR_PERIOD_ACTUAL,
      miceRoomsByDate: LAST_YEAR_MICE_BY_DATE,
      channelShares: LAST_YEAR_CHANNEL_SHARES,
      cancelledMiceRoomsByDate: {},
      random,
    }),
  );

  return {
    hotels: [DEMO_HOTEL],
    channelCommissions: DEMO_CHANNEL_COMMISSIONS,
    dailyStats,
    dailyTargets,
    onTheBooks: generateOnTheBooks(hotelId),
    groupBlocks: DEMO_GROUP_BLOCKS,
    propertyProfiles: [DEMO_PROPERTY_PROFILE],
    rooms: generateDemoRooms(hotelId),
    roomStatusEvents: DEMO_ROOM_STATUS_EVENTS,
  };
}

// ---------------------------------------------------------------------------
// Exact periods: the totals are fixed, only the daily shape is spread out.
// ---------------------------------------------------------------------------

interface ExactPeriodStatsOptions {
  hotelId: string;
  dates: IsoDate[];
  /** Relative daily occupancy; the period's room nights are spread proportionally. */
  occupancyShape: number[];
  amounts: SegmentAmounts;
  miceRoomsByDate: Record<IsoDate, number>;
  channelShares: ChannelSharesBySegment;
  /** Cancelled group block: room nights cancelled per date (recorded on MICE, direct). */
  cancelledMiceRoomsByDate: Record<IsoDate, number>;
  random: SeededRandom;
}

function generateExactPeriodStats(options: ExactPeriodStatsOptions): DailyStat[] {
  const { dates, amounts, random } = options;
  const totalRooms = sumValues(amounts.roomsBySegment);
  const roomsPerDay = allocateByLargestRemainder(totalRooms, options.occupancyShape);

  // MICE is placed on its exact dates. The other segments share what is left of each day.
  const miceRoomsPerDay = dates.map((date) => options.miceRoomsByDate[date] ?? 0);
  assertEqual(sumValues(miceRoomsPerDay), amounts.roomsBySegment.mice, 'MICE rooms by date must add up to the MICE total');
  const otherRoomsPerDay = roomsPerDay.map((rooms, dayIndex) => {
    const remaining = rooms - (miceRoomsPerDay[dayIndex] ?? 0);
    if (remaining < 0) throw new Error(`MICE rooms exceed the day total on ${dates[dayIndex]}`);
    return remaining;
  });

  const roomsByDayAndSegment = balanceIntegerMatrix(
    otherRoomsPerDay,
    NON_MICE_SEGMENTS.map((segment) => amounts.roomsBySegment[segment]),
    dates.map((date) => NON_MICE_SEGMENTS.map((segment) => SEGMENT_DAY_OF_WEEK_WEIGHTS[segment][dayOfWeek(date)]!)),
  );

  const roomDrafts: RoomDraft[] = dates.flatMap((date, dayIndex) => [
    ...NON_MICE_SEGMENTS.flatMap((segment, segmentIndex) =>
      splitRoomsIntoChannels(date, segment, roomsByDayAndSegment[dayIndex]![segmentIndex]!, options.channelShares, random),
    ),
    ...splitRoomsIntoChannels(date, 'mice', miceRoomsPerDay[dayIndex]!, options.channelShares, random),
  ]);

  const statsWithRevenue = attachExactRevenue(roomDrafts, amounts.revenueBySegment, random).map(
    (draft): DailyStat => ({ ...draft, hotelId: options.hotelId, cancellations: estimateCancellations(draft.roomsSold, random) }),
  );

  // The cancelled block shows up as cancellations on rows with no rooms sold.
  for (const [date, cancelledRooms] of Object.entries(options.cancelledMiceRoomsByDate)) {
    statsWithRevenue.push({ hotelId: options.hotelId, date, segment: 'mice', channel: 'direct', roomsSold: 0, roomRevenue: 0, cancellations: cancelledRooms });
  }
  return statsWithRevenue;
}

interface ExactPeriodTargetsOptions {
  hotelId: string;
  dates: IsoDate[];
  amounts: SegmentAmounts;
  miceRoomsByDate: Record<IsoDate, number>;
  /** Dates where the budget expected fewer non-MICE guests (rooms held for a group block). */
  displacedDates: IsoDate[];
}

function generateExactPeriodTargets(options: ExactPeriodTargetsOptions): DailyTarget[] {
  const { dates, amounts } = options;

  const miceRoomsPerDay = dates.map((date) => options.miceRoomsByDate[date] ?? 0);
  assertEqual(sumValues(miceRoomsPerDay), amounts.roomsBySegment.mice, 'MICE target rooms by date must add up to the MICE target');

  const otherRoomsTotal = sumValues(NON_MICE_SEGMENTS.map((segment) => amounts.roomsBySegment[segment]));
  const dayWeights = dates.map(
    (date) => TARGET_DAY_OF_WEEK_WEIGHTS[dayOfWeek(date)]! * (options.displacedDates.includes(date) ? CONGRESS_DISPLACEMENT_FACTOR : 1),
  );
  const otherRoomsPerDay = allocateByLargestRemainder(otherRoomsTotal, dayWeights);

  const roomsByDayAndSegment = balanceIntegerMatrix(
    otherRoomsPerDay,
    NON_MICE_SEGMENTS.map((segment) => amounts.roomsBySegment[segment]),
    dates.map((date) => NON_MICE_SEGMENTS.map((segment) => SEGMENT_DAY_OF_WEEK_WEIGHTS[segment][dayOfWeek(date)]!)),
  );

  const targetRooms: Array<{ date: IsoDate; segment: Segment; roomsTarget: number }> = dates.flatMap((date, dayIndex) => [
    ...NON_MICE_SEGMENTS.map((segment, segmentIndex) => ({ date, segment, roomsTarget: roomsByDayAndSegment[dayIndex]![segmentIndex]! })),
    { date, segment: 'mice' as const, roomsTarget: miceRoomsPerDay[dayIndex]! },
  ]);

  return SEGMENTS.flatMap((segment) => {
    const segmentRows = targetRooms.filter((row) => row.segment === segment && row.roomsTarget > 0);
    const revenues = allocateByLargestRemainder(
      amounts.revenueBySegment[segment],
      segmentRows.map((row) => row.roomsTarget * DAY_OF_WEEK_RATE_FACTOR[dayOfWeek(row.date)]!),
    );
    return segmentRows.map((row, rowIndex) => ({ hotelId: options.hotelId, ...row, roomRevenueTarget: revenues[rowIndex]! }));
  });
}

// ---------------------------------------------------------------------------
// Background days: plausible, seeded, without fixed totals.
// ---------------------------------------------------------------------------

interface BackgroundDayOptions {
  date: IsoDate;
  hotelId: string;
  /** 0 = last year's channel mix, 1 = this November's mix. */
  otaShift: number;
  /** Multiplier on all rates (last year was ~3% cheaper). */
  rateLevel: number;
  random: SeededRandom;
}

function generateBackgroundDay(options: BackgroundDayOptions): { dailyStats: DailyStat[]; dailyTargets: DailyTarget[] } {
  const { date, random } = options;
  const weekday = dayOfWeek(date);
  const month = Number(date.slice(5, 7));

  const occupancy = clamp(
    BACKGROUND_OCCUPANCY_BY_DAY_OF_WEEK[weekday]! + (BACKGROUND_OCCUPANCY_ADJUSTMENT_BY_MONTH[month] ?? 0) + random.between(-0.05, 0.05),
    0.35,
    0.97,
  );
  const roomsSold = Math.round(occupancy * DEMO_HOTEL.roomCount);
  const roomsPerSegment = allocateByLargestRemainder(
    roomsSold,
    SEGMENTS.map((segment) => BACKGROUND_SEGMENT_SHARE[segment] * SEGMENT_DAY_OF_WEEK_WEIGHTS[segment][weekday]! * random.jitter(0.15)),
  );

  const channelShares = interpolateChannelShares(LAST_YEAR_CHANNEL_SHARES, CURRENT_CHANNEL_SHARES, options.otaShift);
  const dayRateFactor = DAY_OF_WEEK_RATE_FACTOR[weekday]!;

  const dailyStats = SEGMENTS.flatMap((segment, segmentIndex) =>
    splitRoomsIntoChannels(date, segment, roomsPerSegment[segmentIndex]!, channelShares, random).map(
      (draft): DailyStat => ({
        ...draft,
        hotelId: options.hotelId,
        roomRevenue: Math.round(
          draft.roomsSold * BACKGROUND_BASE_RATE[segment] * options.rateLevel * dayRateFactor * CHANNEL_RATE_FACTOR[draft.channel] * random.jitter(0.04),
        ),
        cancellations: estimateCancellations(draft.roomsSold, random),
      }),
    ),
  );

  // Budget: a little above what was achieved, at the base rate.
  const dailyTargets = SEGMENTS.map((segment, segmentIndex): DailyTarget => {
    const roomsTarget = Math.round(roomsPerSegment[segmentIndex]! * random.between(1.0, 1.08));
    return {
      hotelId: options.hotelId,
      date,
      segment,
      roomsTarget,
      roomRevenueTarget: Math.round(roomsTarget * BACKGROUND_BASE_RATE[segment] * options.rateLevel * dayRateFactor),
    };
  }).filter((target) => target.roomsTarget > 0);

  return { dailyStats, dailyTargets };
}

// ---------------------------------------------------------------------------
// On the books: snapshots of future bookings for the rest of November.
// ---------------------------------------------------------------------------

function generateOnTheBooks(hotelId: string): OnTheBooks[] {
  const isLateNovember = (stayDate: IsoDate) => stayDate >= '2026-11-21';
  const lateNovemberPlan = PACE_PLAN.filter((plan) => isLateNovember(plan.stayDate));
  const earlyPlan = PACE_PLAN.filter((plan) => !isLateNovember(plan.stayDate));

  /** Spreads a pickup total over the stay dates, proportional to what is on the books. */
  function spreadPickup(pickupLate: number, pickupEarly: number, roomsOf: (plan: (typeof PACE_PLAN)[number]) => number): Map<IsoDate, number> {
    const pickupByDate = new Map<IsoDate, number>();
    const lateShares = allocateByLargestRemainder(pickupLate, lateNovemberPlan.map(roomsOf));
    const earlyShares = allocateByLargestRemainder(pickupEarly, earlyPlan.map(roomsOf));
    lateNovemberPlan.forEach((plan, index) => pickupByDate.set(plan.stayDate, lateShares[index]!));
    earlyPlan.forEach((plan, index) => pickupByDate.set(plan.stayDate, earlyShares[index]!));
    return pickupByDate;
  }

  const pickup = PACE_PICKUP_FOR_LATE_NOVEMBER;
  const thisYearPickup7 = spreadPickup(pickup.last7Days, 10, (plan) => plan.roomsOnTheBooks);
  const thisYearPickupExtra = spreadPickup(pickup.last14Days - pickup.last7Days, 8, (plan) => plan.roomsOnTheBooks);
  const lastYearPickup7 = spreadPickup(pickup.last7DaysLastYear, 14, (plan) => plan.roomsOnTheBooksLastYear);
  const lastYearPickupExtra = spreadPickup(pickup.last14DaysLastYear - pickup.last7DaysLastYear, 11, (plan) => plan.roomsOnTheBooksLastYear);

  const rows: OnTheBooks[] = [];
  for (const plan of PACE_PLAN) {
    const snapshots = [
      { yearOffset: 0, daysBefore: 0, rooms: plan.roomsOnTheBooks },
      { yearOffset: 0, daysBefore: 7, rooms: plan.roomsOnTheBooks - thisYearPickup7.get(plan.stayDate)! },
      { yearOffset: 0, daysBefore: 14, rooms: plan.roomsOnTheBooks - thisYearPickup7.get(plan.stayDate)! - thisYearPickupExtra.get(plan.stayDate)! },
      { yearOffset: -1, daysBefore: 0, rooms: plan.roomsOnTheBooksLastYear },
      { yearOffset: -1, daysBefore: 7, rooms: plan.roomsOnTheBooksLastYear - lastYearPickup7.get(plan.stayDate)! },
      {
        yearOffset: -1,
        daysBefore: 14,
        rooms: plan.roomsOnTheBooksLastYear - lastYearPickup7.get(plan.stayDate)! - lastYearPickupExtra.get(plan.stayDate)!,
      },
    ];
    for (const snapshot of snapshots) {
      const averageRate = snapshot.yearOffset === 0 ? PACE_AVERAGE_RATE.thisYear : PACE_AVERAGE_RATE.lastYear;
      rows.push({
        hotelId,
        snapshotDate: addDays(shiftDateByYears(DEMO_TODAY, snapshot.yearOffset), -snapshot.daysBefore),
        stayDate: shiftDateByYears(plan.stayDate, snapshot.yearOffset),
        roomsOnTheBooks: snapshot.rooms,
        revenueOnTheBooks: snapshot.rooms * averageRate,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function splitRoomsIntoChannels(
  date: IsoDate,
  segment: Segment,
  rooms: number,
  channelShares: ChannelSharesBySegment,
  random: SeededRandom,
): RoomDraft[] {
  if (rooms === 0) return [];
  const roomsPerChannel = allocateByLargestRemainder(
    rooms,
    CHANNELS.map((channel) => channelShares[segment][channel] * random.jitter(0.12)),
  );
  return CHANNELS.map((channel, channelIndex) => ({ date, segment, channel, roomsSold: roomsPerChannel[channelIndex]! })).filter(
    (draft) => draft.roomsSold > 0,
  );
}

/** Gives each segment exactly its revenue total, spread by rooms × day rate × channel rate. */
function attachExactRevenue(
  drafts: RoomDraft[],
  revenueBySegment: Record<Segment, number>,
  random: SeededRandom,
): Array<RoomDraft & { roomRevenue: number }> {
  return SEGMENTS.flatMap((segment) => {
    const segmentDrafts = drafts.filter((draft) => draft.segment === segment);
    const revenues = allocateByLargestRemainder(
      revenueBySegment[segment],
      segmentDrafts.map(
        (draft) =>
          draft.roomsSold * DAY_OF_WEEK_RATE_FACTOR[dayOfWeek(draft.date)]! * CHANNEL_RATE_FACTOR[draft.channel] * random.jitter(0.03),
      ),
    );
    return segmentDrafts.map((draft, draftIndex) => ({ ...draft, roomRevenue: revenues[draftIndex]! }));
  });
}

function interpolateChannelShares(from: ChannelSharesBySegment, to: ChannelSharesBySegment, progress: number): ChannelSharesBySegment {
  return Object.fromEntries(
    SEGMENTS.map((segment) => [
      segment,
      Object.fromEntries(CHANNELS.map((channel) => [channel, from[segment][channel] + (to[segment][channel] - from[segment][channel]) * progress])),
    ]),
  ) as ChannelSharesBySegment;
}

/** About 0–5% of rooms sold get cancelled. */
function estimateCancellations(roomsSold: number, random: SeededRandom): number {
  return Math.round(roomsSold * random.between(0, 0.05));
}

function sumValues(values: Record<string, number> | number[]): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertEqual(actual: number, expected: number, message: string): void {
  if (actual !== expected) throw new Error(`${message} (got ${actual}, expected ${expected})`);
}
