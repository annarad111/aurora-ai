import { z } from 'zod';

// ---------------------------------------------------------------------------
// Domain model. These shapes mirror the five database tables from the
// architecture doc (hotels, daily_stats, targets, channels, on_the_books).
// Each one is a Zod schema; the TypeScript type is inferred from it, so the
// runtime check and the compile-time type can never drift apart.
// ---------------------------------------------------------------------------

/** Calendar date as "YYYY-MM-DD". Dates are hotel-local, without a time zone. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD');
export type IsoDate = z.infer<typeof isoDateSchema>;

/** Calendar month as "YYYY-MM". */
export const isoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Expected a month as YYYY-MM');
export type IsoMonth = z.infer<typeof isoMonthSchema>;

/** Inclusive date range: both `from` and `to` are counted. */
export const dateRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((range) => range.from <= range.to, 'The range must not end before it starts');
export type DateRange = z.infer<typeof dateRangeSchema>;

export const SEGMENTS = ['corporate', 'leisure', 'group', 'mice'] as const;
export const segmentSchema = z.enum(SEGMENTS);
export type Segment = z.infer<typeof segmentSchema>;

export const SEGMENT_LABELS: Record<Segment, string> = {
  corporate: 'Corporate',
  leisure: 'Leisure',
  group: 'Groups',
  mice: 'MICE',
};

export const CHANNELS = ['direct', 'ota', 'gds', 'wholesale'] as const;
export const channelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof channelSchema>;

export const CHANNEL_LABELS: Record<Channel, string> = {
  direct: 'Direct',
  ota: 'OTA',
  gds: 'GDS',
  wholesale: 'Wholesale',
};

/** Table `hotels`. */
export const hotelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  city: z.string(),
  roomCount: z.number().int().positive(),
  currency: z.literal('EUR'),
  timezone: z.string(),
});
export type Hotel = z.infer<typeof hotelSchema>;

/** Table `daily_stats`: one row per hotel, day, segment and channel. */
export const dailyStatSchema = z.object({
  hotelId: z.string(),
  date: isoDateSchema,
  segment: segmentSchema,
  channel: channelSchema,
  roomsSold: z.number().int().nonnegative(),
  roomRevenue: z.number().nonnegative(),
  cancellations: z.number().int().nonnegative(),
});
export type DailyStat = z.infer<typeof dailyStatSchema>;

/**
 * Table `targets`: the budget, per day and segment.
 * Daily rather than monthly, so a month-to-date period compares against exactly
 * the budget of those days, and a group block can be budgeted on its own dates.
 */
export const dailyTargetSchema = z.object({
  hotelId: z.string(),
  date: isoDateSchema,
  segment: segmentSchema,
  roomsTarget: z.number().int().nonnegative(),
  roomRevenueTarget: z.number().nonnegative(),
});
export type DailyTarget = z.infer<typeof dailyTargetSchema>;

/** Table `channels`: the commission each distribution channel charges. */
export const channelCommissionSchema = z.object({
  channel: channelSchema,
  name: z.string(),
  /** Fraction of room revenue, e.g. 0.18 for 18 %. */
  commissionRate: z.number().min(0).max(1),
});
export type ChannelCommission = z.infer<typeof channelCommissionSchema>;

/** Table `on_the_books`: rooms already booked for a future night, as seen on a snapshot date. */
export const onTheBooksSchema = z.object({
  hotelId: z.string(),
  snapshotDate: isoDateSchema,
  stayDate: isoDateSchema,
  roomsOnTheBooks: z.number().int().nonnegative(),
  revenueOnTheBooks: z.number().nonnegative(),
});
export type OnTheBooks = z.infer<typeof onTheBooksSchema>;
