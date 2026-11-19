import { z } from 'zod';
import { channelSchema, dateRangeSchema, isoDateSchema, segmentSchema } from './domain';
import { metricIdSchema } from './metric-meta';

// ---------------------------------------------------------------------------
// An investigation: what the user is looking into when a question comes from
// a briefing item, a chart point or a KPI card instead of being typed. It
// travels with the question as structured data, so the server runs exactly
// that analysis on exactly those dates, whatever the wording.
//
// The server never trusts it blindly: dates that do not fit the analysis are
// ignored, and a data query is validated like any other tool input.
// ---------------------------------------------------------------------------

/** Analyses an investigation can open. */
export const INVESTIGATION_INTENTS = ['revenue_gap', 'channel_cost', 'booking_pace', 'segment_shift', 'group_blocks', 'data_question'] as const;
export const investigationIntentSchema = z.enum(INVESTIGATION_INTENTS);

/** Where the investigation started. */
export const INVESTIGATION_ORIGINS = ['briefing', 'chart', 'kpi', 'property'] as const;
export const investigationOriginSchema = z.enum(INVESTIGATION_ORIGINS);

/** What the user asked of the selection. Evidence is shown in the browser and needs no request. */
export const INVESTIGATION_INTERACTIONS = ['explain', 'compare', 'investigate'] as const;
export const investigationInteractionSchema = z.enum(INVESTIGATION_INTERACTIONS);
export type InvestigationInteraction = z.infer<typeof investigationInteractionSchema>;

/** For data questions: how to split the nights. */
export const INVESTIGATION_BREAKDOWNS = ['none', 'segment', 'channel'] as const;

export const investigationContextSchema = z.object({
  origin: investigationOriginSchema,
  intent: investigationIntentSchema,
  interaction: investigationInteractionSchema.optional(),
  /** The briefing item this came from. */
  insightId: z.string().min(1).max(80).optional(),
  metric: metricIdSchema.optional(),
  /** Past nights for analyses and data questions, future stay dates for pace. */
  dateRange: dateRangeSchema.optional(),
  /** The selected chart point, when there is one. */
  date: isoDateSchema.optional(),
  segment: segmentSchema.optional(),
  channel: channelSchema.optional(),
  /** Data questions: how to split the nights (always compared with last year). */
  breakdown: z.enum(INVESTIGATION_BREAKDOWNS).optional(),
  /** The selected figure and what it was compared with, as shown on screen. */
  selectedValue: z.number().finite().optional(),
  baseline: z.number().finite().optional(),
  /** "target", "last year", "same point last year". */
  baselineLabel: z.string().max(40).optional(),
});
export type InvestigationContext = z.infer<typeof investigationContextSchema>;
