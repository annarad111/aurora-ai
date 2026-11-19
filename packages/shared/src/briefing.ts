import { z } from 'zod';
import { channelSchema, dateRangeSchema, isoDateSchema, segmentSchema } from './domain';
import { metricIdSchema } from './metric-meta';
import { toolNameSchema } from './tools';

// ---------------------------------------------------------------------------
// The morning briefing: the few things that deserve the manager's attention
// today, ranked by fixed rules from the hotel's data (no model, no guessing).
// GET /api/briefing?hotel=<id>
//
// Each item opens an investigation in the chat. The investigation travels as
// structured context, so the server runs exactly the analysis the item is
// about, on exactly its dates, whatever the wording of the question.
// ---------------------------------------------------------------------------

/** Analyses an investigation can open. Data questions are asked in words. */
export const INVESTIGATION_INTENTS = ['revenue_gap', 'channel_cost', 'booking_pace', 'segment_shift', 'group_blocks'] as const;
export const investigationIntentSchema = z.enum(INVESTIGATION_INTENTS);

/** Where an investigation started: a briefing item (later also a chart point or a KPI). */
export const INVESTIGATION_ORIGINS = ['briefing'] as const;
export const investigationOriginSchema = z.enum(INVESTIGATION_ORIGINS);

/** What the user is investigating, sent with the question instead of being retyped. */
export const investigationContextSchema = z.object({
  origin: investigationOriginSchema,
  intent: investigationIntentSchema,
  /** The briefing item this came from, to reopen it or save it later. */
  insightId: z.string().min(1).max(80).optional(),
  metric: metricIdSchema.optional(),
  /** Past nights for analyses, future stay dates for pace. */
  dateRange: dateRangeSchema.optional(),
  segment: segmentSchema.optional(),
  channel: channelSchema.optional(),
});
export type InvestigationContext = z.infer<typeof investigationContextSchema>;

/** Critical: hurting results now. Important: worth a look today. Opportunity: something to use. */
export const BRIEFING_PRIORITIES = ['critical', 'important', 'opportunity'] as const;
export const briefingPrioritySchema = z.enum(BRIEFING_PRIORITIES);
export type BriefingPriority = z.infer<typeof briefingPrioritySchema>;

/** The figure an item is about, against its baseline. The UI formats it by `unit`. */
export const briefingMeasureSchema = z.object({
  label: z.string(),
  unit: z.enum(['currency', 'ratio', 'count']),
  value: z.number(),
  baseline: z.number(),
  /** "target", "last year", "last year at this point". */
  baselineLabel: z.string(),
  /** How to show the difference: relative (−16%) or in percentage points (+4.0 pp). */
  deltaStyle: z.enum(['relative_percent', 'percentage_points']),
});
export type BriefingMeasure = z.infer<typeof briefingMeasureSchema>;

export const briefingInsightSchema = z.object({
  /** Stable for the same finding on the same data ("pace:2026-11-21:2026-11-30"). */
  id: z.string().min(1).max(80),
  priority: briefingPrioritySchema,
  topic: z.string(),
  title: z.string(),
  explanation: z.string(),
  measure: briefingMeasureSchema,
  /** The nights the figure is about. */
  period: dateRangeSchema,
  /** Where the figure comes from, in words ("Booking pace snapshot"). */
  source: z.string(),
  sourceTool: toolNameSchema,
  action: z.object({
    label: z.string(),
    /** Shown as the user's question in the chat. */
    question: z.string().max(280),
    context: investigationContextSchema,
  }),
});
export type BriefingInsight = z.infer<typeof briefingInsightSchema>;

/** The data a briefing reads. A source that could not be read makes the briefing partial. */
export const BRIEFING_SOURCES = ['performance', 'revenue_drivers', 'channels', 'booking_pace', 'group_blocks'] as const;
export const briefingSourceSchema = z.enum(BRIEFING_SOURCES);
export type BriefingSource = z.infer<typeof briefingSourceSchema>;

export const morningBriefingSchema = z.object({
  hotelId: z.string(),
  hotelName: z.string(),
  reportDate: isoDateSchema,
  /** The last night with performance data (month to date ends here). */
  dataThrough: isoDateSchema.nullable(),
  /** When the bookings on the books were counted. */
  bookingsSnapshotDate: isoDateSchema.nullable(),
  /** At most three, most urgent first. Empty when nothing stands out. */
  insights: z.array(briefingInsightSchema).max(3),
  /** Sources that could not be read; the briefing is built from the rest. */
  unavailableSources: z.array(briefingSourceSchema),
});
export type MorningBriefing = z.infer<typeof morningBriefingSchema>;
