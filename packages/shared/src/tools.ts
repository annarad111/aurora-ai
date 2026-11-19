import { z } from 'zod';
import { breakdownDimensionSchema, dayTypeSchema } from './breakdown';
import { channelSchema, dateRangeSchema, groupBlockSchema, hotelSchema, isoDateSchema, segmentSchema } from './domain';
import { findingSchema } from './findings';
import { getDecisionsInputSchema, getDecisionsOutputSchema } from './decisions';
import { metricIdSchema, metricStatusSchema } from './metric-meta';

// ---------------------------------------------------------------------------
// Input and output contracts of the read-only tools.
//
// The same schemas are used by:
//   - the chat orchestrator, which calls the tools directly (step 4)
//   - the MCP server at /mcp, which exposes them to external agents (step 9)
// Ratios are fractions (0.62), money is euros, counts are room nights.
// ---------------------------------------------------------------------------

export { TOOL_NAMES, toolNameSchema, type ToolName } from './tool-names';

const hotelIdSchema = z.string().min(1).max(64);

/** Shared input of the three tools that look at a past period. */
export const periodToolInputSchema = z.object({
  hotelId: hotelIdSchema,
  period: dateRangeSchema,
});
export type PeriodToolInput = z.infer<typeof periodToolInputSchema>;

// --- get_hotel_overview ----------------------------------------------------

export const kpiComparisonSchema = z.object({
  metric: metricIdSchema,
  actual: z.number(),
  target: z.number().nullable(),
  lastYear: z.number().nullable(),
  status: metricStatusSchema,
});
export type KpiComparison = z.infer<typeof kpiComparisonSchema>;

export const segmentPerformanceSchema = z.object({
  segment: segmentSchema,
  roomsSold: z.number(),
  roomsTarget: z.number(),
  roomsSoldLastYear: z.number(),
  roomRevenue: z.number(),
  roomsCancelled: z.number(),
});

export const dailyOccupancySchema = z.object({
  date: isoDateSchema,
  occupancy: z.number(),
  occupancyTarget: z.number().nullable(),
  occupancyLastYear: z.number(),
  /** Room nights cancelled for this night. A spike marks a cancelled group block. */
  roomsCancelled: z.number(),
});

export const hotelOverviewOutputSchema = z.object({
  hotel: hotelSchema,
  period: dateRangeSchema,
  roomsAvailable: z.number(),
  roomsSold: z.number(),
  roomRevenue: z.number(),
  kpis: z.array(kpiComparisonSchema),
  segments: z.array(segmentPerformanceSchema),
  dailyOccupancy: z.array(dailyOccupancySchema),
  /** Group blocks with at least one night in the period, confirmed or cancelled. */
  groupBlocks: z.array(groupBlockSchema),
});
export type HotelOverviewOutput = z.infer<typeof hotelOverviewOutputSchema>;

// --- analyze_revenue_drivers -----------------------------------------------

export const segmentVarianceSchema = z.object({
  segment: segmentSchema,
  roomsSoldActual: z.number(),
  roomsSoldTarget: z.number(),
  adrActual: z.number(),
  adrTarget: z.number(),
  shareOfRoomsActual: z.number(),
  shareOfRoomsTarget: z.number(),
  /** This segment's part of the volume effect. The segment parts add up to the total volume effect. */
  volumeEffect: z.number(),
  /** This segment's part of the mix effect (same rule: the parts add up to the total). */
  mixEffect: z.number(),
  /** This segment's part of the pure price effect. */
  purePriceEffect: z.number(),
});

export const revenueDriversOutputSchema = z.object({
  period: dateRangeSchema,
  roomRevenueActual: z.number(),
  roomRevenueTarget: z.number(),
  revenueGap: z.number(),
  volumeEffect: z.number(),
  priceEffect: z.number(),
  mixEffect: z.number(),
  purePriceEffect: z.number(),
  segments: z.array(segmentVarianceSchema),
  findings: z.array(findingSchema),
});
export type RevenueDriversOutput = z.infer<typeof revenueDriversOutputSchema>;

// --- get_channel_mix -------------------------------------------------------

export const channelShareSchema = z.object({
  channel: channelSchema,
  roomRevenue: z.number(),
  revenueShare: z.number(),
  revenueShareLastYear: z.number(),
  commissionRate: z.number(),
  commissionCost: z.number(),
});

/** Mix of an earlier period, for the "previous months and last year" comparison. */
export const channelMixSnapshotSchema = z.object({
  label: z.string(),
  period: dateRangeSchema,
  revenueShareByChannel: z.record(channelSchema, z.number()),
  commissionShareOfRevenue: z.number(),
});

export const channelMixOutputSchema = z.object({
  period: dateRangeSchema,
  roomRevenue: z.number(),
  channels: z.array(channelShareSchema),
  totalCommissionCost: z.number(),
  commissionShareOfRevenue: z.number(),
  /** Commission paid now minus what the same revenue would cost with last year's channel shares. */
  extraCommissionFromMixShift: z.number(),
  netRevpar: z.number(),
  netRevparTarget: z.number().nullable(),
  comparisonPeriods: z.array(channelMixSnapshotSchema),
});
export type ChannelMixOutput = z.infer<typeof channelMixOutputSchema>;

// --- get_booking_pace ------------------------------------------------------

export const bookingPaceInputSchema = z.object({
  hotelId: hotelIdSchema,
  stayFrom: isoDateSchema,
  stayTo: isoDateSchema,
});
export type BookingPaceInput = z.infer<typeof bookingPaceInputSchema>;

export const stayDatePaceSchema = z.object({
  stayDate: isoDateSchema,
  roomsOnTheBooks: z.number(),
  roomsOnTheBooksLastYear: z.number(),
});

export const bookingPaceOutputSchema = z.object({
  stayFrom: isoDateSchema,
  stayTo: isoDateSchema,
  snapshotDate: isoDateSchema,
  roomsOnTheBooks: z.number(),
  roomsOnTheBooksLastYear: z.number(),
  /** (on the books − last year) / last year. −0.16 means 16% behind. */
  changeVsLastYear: z.number(),
  pickupLast7Days: z.number(),
  pickupLast7DaysLastYear: z.number(),
  status: metricStatusSchema,
  stayDates: z.array(stayDatePaceSchema),
});
export type BookingPaceOutput = z.infer<typeof bookingPaceOutputSchema>;

// --- query_performance ------------------------------------------------------

/** Longest period one query may cover, to keep answers small. */
const MAXIMUM_QUERY_NIGHTS = 400;

export const queryPerformanceInputSchema = z.object({
  hotelId: hotelIdSchema,
  period: dateRangeSchema.refine(
    (range) => (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 < MAXIMUM_QUERY_NIGHTS,
    `A query may cover at most ${MAXIMUM_QUERY_NIGHTS} nights`,
  ),
  /** How to split the period. "day_type" splits weekend (Friday and Saturday nights) from weekday nights. */
  groupBy: breakdownDimensionSchema.default('none'),
  /** Only these segments (all when absent). */
  segments: z.array(segmentSchema).min(1).optional(),
  /** Only these channels (all when absent). */
  channels: z.array(channelSchema).min(1).optional(),
  /** Only weekend or only weekday nights (all when absent). */
  dayType: dayTypeSchema.optional(),
  /** Adds the same nights one year earlier to every row. */
  compareWithLastYear: z.boolean().default(false),
});
export type QueryPerformanceInput = z.infer<typeof queryPerformanceInputSchema>;

const performanceValuesSchema = z.object({
  nights: z.number(),
  roomsAvailable: z.number(),
  roomsSold: z.number(),
  roomRevenue: z.number(),
  cancellations: z.number(),
  commissionCost: z.number(),
  occupancy: z.number(),
  adr: z.number(),
  revpar: z.number(),
  netRevpar: z.number(),
});
export type PerformanceValues = z.infer<typeof performanceValuesSchema>;

export const performanceRowSchema = performanceValuesSchema.extend({
  /** Stable key: "2026-11-05", "saturday", "weekend", "corporate", "ota", "total". */
  key: z.string(),
  label: z.string(),
  lastYear: performanceValuesSchema.nullable(),
});
export type PerformanceRow = z.infer<typeof performanceRowSchema>;

export const queryPerformanceOutputSchema = z.object({
  period: dateRangeSchema,
  groupBy: breakdownDimensionSchema,
  filters: z.object({
    segments: z.array(segmentSchema).nullable(),
    channels: z.array(channelSchema).nullable(),
    dayType: dayTypeSchema.nullable(),
  }),
  rows: z.array(performanceRowSchema),
  totals: performanceRowSchema,
  /** The query in words, for provenance: which rows were read and how they were grouped. */
  sourceQuery: z.string(),
});
export type QueryPerformanceOutput = z.infer<typeof queryPerformanceOutputSchema>;

// --- get_group_blocks ---------------------------------------------------------

export const groupBlocksOutputSchema = z.object({
  period: dateRangeSchema,
  blocks: z.array(groupBlockSchema),
});
export type GroupBlocksOutput = z.infer<typeof groupBlocksOutputSchema>;

// --- simulate_scenario -------------------------------------------------------

/**
 * The three levers of a what-if, all about future stay dates:
 *   paceRecovery  share of the room nights behind last year's pace that are won back (0–1)
 *   rateChange    rate of the rooms still to sell vs the rate on the books (−0.3 to +0.3)
 *   otaToDirect   share of OTA bookings that come direct instead (0–1)
 */
export const scenarioLeversSchema = z.object({
  paceRecovery: z.number().min(0).max(1).default(0),
  rateChange: z.number().min(-0.3).max(0.3).default(0),
  otaToDirect: z.number().min(0).max(1).default(0),
});
export type ScenarioLevers = z.infer<typeof scenarioLeversSchema>;

/** What a what-if starts from, read from the database. Everything the calculation needs, and nothing else. */
export const scenarioBasisSchema = z.object({
  stayFrom: isoDateSchema,
  stayTo: isoDateSchema,
  /** Room nights the hotel can sell on those dates (rooms × nights). */
  roomNightsAvailable: z.number().nonnegative(),
  roomsOnTheBooks: z.number().nonnegative(),
  revenueOnTheBooks: z.number().nonnegative(),
  roomsOnTheBooksLastYear: z.number().nonnegative(),
  /** Share of room revenue per channel, from the month so far: the expected mix of those nights. */
  channelRevenueShares: z.record(channelSchema, z.number().min(0).max(1)),
  channelMixPeriod: dateRangeSchema,
  /** Commission per channel, as a fraction of room revenue. */
  commissionRates: z.record(channelSchema, z.number().min(0).max(1)),
});
export type ScenarioBasis = z.infer<typeof scenarioBasisSchema>;

const scenarioTotalsSchema = z.object({
  roomNights: z.number(),
  roomRevenue: z.number(),
  commission: z.number(),
  /** Room revenue after commission. */
  netRevenue: z.number(),
});

export const scenarioOutcomeSchema = z.object({
  averageRateOnTheBooks: z.number(),
  roomNightsBehindLastYear: z.number(),
  recoveredRoomNights: z.number(),
  /** True when the hotel would be full before the whole recovery fits. */
  limitedByCapacity: z.boolean(),
  rateForNewBookings: z.number(),
  /** Today's position: what is on the books. */
  baseline: scenarioTotalsSchema,
  scenario: scenarioTotalsSchema,
  /** Where the change in net revenue comes from. The four add up to netChange exactly. */
  effects: z.object({
    recoveredNights: z.number(),
    rateOnNewBookings: z.number(),
    commissionOnNewRevenue: z.number(),
    commissionSavedByDirect: z.number(),
    netChange: z.number(),
  }),
});
export type ScenarioOutcome = z.infer<typeof scenarioOutcomeSchema>;

export const simulateScenarioInputSchema = z
  .object({
    hotelId: hotelIdSchema,
    /** Future stay dates, both included. */
    stayFrom: isoDateSchema,
    stayTo: isoDateSchema,
  })
  .extend(scenarioLeversSchema.shape);
export type SimulateScenarioInput = z.infer<typeof simulateScenarioInputSchema>;

export const simulateScenarioOutputSchema = z.object({
  levers: scenarioLeversSchema,
  basis: scenarioBasisSchema,
  outcome: scenarioOutcomeSchema,
});
export type SimulateScenarioOutput = z.infer<typeof simulateScenarioOutputSchema>;

/** Maps each tool name to its input and output schema. The tool registry (step 3) builds on this. */
export const TOOL_SCHEMAS = {
  get_hotel_overview: { input: periodToolInputSchema, output: hotelOverviewOutputSchema },
  analyze_revenue_drivers: { input: periodToolInputSchema, output: revenueDriversOutputSchema },
  get_channel_mix: { input: periodToolInputSchema, output: channelMixOutputSchema },
  get_booking_pace: { input: bookingPaceInputSchema, output: bookingPaceOutputSchema },
  query_performance: { input: queryPerformanceInputSchema, output: queryPerformanceOutputSchema },
  get_group_blocks: { input: periodToolInputSchema, output: groupBlocksOutputSchema },
  simulate_scenario: { input: simulateScenarioInputSchema, output: simulateScenarioOutputSchema },
  get_decisions: { input: getDecisionsInputSchema, output: getDecisionsOutputSchema },
} as const;
