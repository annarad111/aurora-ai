import { z } from 'zod';
import { metricIdSchema, metricStatusSchema } from './metric-meta';
import {
  bookingPaceOutputSchema,
  channelMixOutputSchema,
  hotelOverviewOutputSchema,
  revenueDriversOutputSchema,
  toolNameSchema,
} from './tools';

// ---------------------------------------------------------------------------
// Events streamed from POST /api/chat to the browser (Server-Sent Events).
//
// Every event carries the run it belongs to and an increasing sequence
// number. The worker validates each event before sending it, and the browser
// validates it again on arrival.
//
// Typical order:
//   run_started → step(running) → kpi… → step(done) → insight → chart…
//   → text_delta… → provenance… → followups → done
// ---------------------------------------------------------------------------

const eventEnvelope = {
  runId: z.string(),
  /** 0, 1, 2… per run, so the client can detect gaps or out-of-order events. */
  sequence: z.number().int().nonnegative(),
};

export const runStartedEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('run_started'),
  question: z.string(),
  hotelId: z.string(),
});

export const STEP_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export const stepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = z.infer<typeof stepStatusSchema>;

/** One line of the run timeline: "Checking occupancy and rate · get_hotel_overview". */
export const stepEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('step'),
  stepId: z.string(),
  label: z.string(),
  tool: toolNameSchema,
  status: stepStatusSchema,
});

/** One KPI card. The status is computed by the analytics; the UI only colours it. */
export const kpiEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('kpi'),
  factId: z.string(),
  metric: metricIdSchema,
  label: z.string(),
  actual: z.number(),
  /** What the delta is measured against. */
  reference: z.number().nullable(),
  referenceKind: z.enum(['target', 'last_year', 'none']),
  status: metricStatusSchema,
});

/** A clickable chip under the main finding ("204 lost room nights"). */
export const insightChipSchema = z.object({
  factId: z.string(),
  label: z.string(),
  status: metricStatusSchema,
});

/** The main finding: the executive summary, shown before the details. */
export const insightEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('insight'),
  headline: z.string(),
  impactEur: z.number(),
  factIds: z.array(z.string()),
  chips: z.array(insightChipSchema),
});

/**
 * A piece of the written explanation. Plain text has no `factId`.
 * A figure ("245 fewer room nights") carries the fact it belongs to, so the UI
 * can render it as a clickable button.
 */
export const textDeltaEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('text_delta'),
  text: z.string(),
  factId: z.string().optional(),
});

/** Chart data for the evidence panel. The payload is the output of the tool behind the chart. */
export const chartPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('revenue_bridge'), data: revenueDriversOutputSchema }),
  z.object({ kind: z.literal('channel_mix'), data: channelMixOutputSchema }),
  z.object({ kind: z.literal('booking_pace'), data: bookingPaceOutputSchema }),
  z.object({ kind: z.literal('occupancy_trend'), data: hotelOverviewOutputSchema }),
]);
export type ChartPayload = z.infer<typeof chartPayloadSchema>;
export type ChartKind = ChartPayload['kind'];

export const chartEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('chart'),
  chart: chartPayloadSchema,
  factIds: z.array(z.string()),
});

/** Everything "How was this calculated?" shows for one figure. */
export const provenanceEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('provenance'),
  factId: z.string(),
  title: z.string(),
  displayValue: z.string(),
  tool: toolNameSchema,
  formula: z.string(),
  inputs: z.array(z.object({ label: z.string(), value: z.string() })),
  sourceQuery: z.string(),
});

export const followupsEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('followups'),
  questions: z.array(z.string()).min(1).max(4),
});

export const doneEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('done'),
  durationMs: z.number().nonnegative(),
  /** Who wrote the narrative: the language model, or the deterministic template fallback. */
  provider: z.enum(['llm', 'scripted']),
  /** How many figures in the text were matched to tool output. */
  verifiedFigureCount: z.number().int().nonnegative(),
});

export const errorEventSchema = z.object({
  ...eventEnvelope,
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  /** True when "Retry" makes sense (timeout, rate limit), false for bad input. */
  recoverable: z.boolean(),
});

export const streamEventSchema = z.discriminatedUnion('type', [
  runStartedEventSchema,
  stepEventSchema,
  kpiEventSchema,
  insightEventSchema,
  textDeltaEventSchema,
  chartEventSchema,
  provenanceEventSchema,
  followupsEventSchema,
  doneEventSchema,
  errorEventSchema,
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type StreamEventType = StreamEvent['type'];

/** Narrows the union: StreamEventOfType<'kpi'> is the KPI event. */
export type StreamEventOfType<EventType extends StreamEventType> = Extract<StreamEvent, { type: EventType }>;

/** Request body of POST /api/chat. */
export const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(280),
  hotelId: z.string().min(1).max(64),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
