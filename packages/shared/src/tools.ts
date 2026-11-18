import { z } from 'zod';
import { channelSchema, dateRangeSchema, groupBlockSchema, hotelSchema, isoDateSchema, segmentSchema } from './domain';
import { findingSchema } from './findings';
import { metricIdSchema, metricStatusSchema } from './metric-meta';

// ---------------------------------------------------------------------------
// Input and output contracts of the four read-only tools.
//
// The same schemas are used by:
//   - the chat orchestrator, which calls the tools directly (step 4)
//   - the MCP server at /mcp, which exposes them to external agents (step 9)
// Ratios are fractions (0.62), money is euros, counts are room nights.
// ---------------------------------------------------------------------------

export const TOOL_NAMES = [
  'get_hotel_overview',
  'analyze_revenue_drivers',
  'get_channel_mix',
  'get_booking_pace',
] as const;
export const toolNameSchema = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof toolNameSchema>;

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

/** Maps each tool name to its input and output schema. The tool registry (step 3) builds on this. */
export const TOOL_SCHEMAS = {
  get_hotel_overview: { input: periodToolInputSchema, output: hotelOverviewOutputSchema },
  analyze_revenue_drivers: { input: periodToolInputSchema, output: revenueDriversOutputSchema },
  get_channel_mix: { input: periodToolInputSchema, output: channelMixOutputSchema },
  get_booking_pace: { input: bookingPaceInputSchema, output: bookingPaceOutputSchema },
} as const;
