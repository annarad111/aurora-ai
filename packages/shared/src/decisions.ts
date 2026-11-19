import { z } from 'zod';
import { dateRangeSchema, isoDateSchema } from './domain';
import { investigationContextSchema } from './investigation';
import { metricIdSchema } from './metric-meta';
import { conversationIdSchema } from './stream-events';
import { toolNameSchema } from './tools';

// ---------------------------------------------------------------------------
// Insight to action: insights the user saved, the actions they decided on,
// and what the data showed afterwards.
//
//   GET    /api/decisions?hotel=<id>          saved insights, actions, outcomes
//   POST   /api/decisions/insights            save an insight (saving it again returns the same one)
//   DELETE /api/decisions/insights/:id        remove it (only when it has no actions)
//   POST   /api/decisions/actions             create an action from a saved insight
//   PATCH  /api/decisions/actions/:id         change it (status, owner, notes…)
//   DELETE /api/decisions/actions/:id
//
// Stored in D1 as JSON with a record version, so the format can change later;
// a stored record that no longer reads is skipped and counted, never fatal.
// ---------------------------------------------------------------------------

/** The format of stored records. Raise it when a field changes meaning, and read old versions explicitly. */
export const DECISION_RECORD_VERSION = 1;

const recordIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

/** The figure an insight is about, against its baseline, as it was when saved. */
export const savedMeasureSchema = z.object({
  label: z.string().max(80),
  unit: z.enum(['currency', 'ratio', 'count']),
  value: z.number().finite(),
  baseline: z.number().finite().nullable(),
  baselineLabel: z.string().max(40).nullable(),
});
export type SavedMeasure = z.infer<typeof savedMeasureSchema>;

/** A figure behind the insight and the tool that produced it. */
export const evidenceReferenceSchema = z.object({
  label: z.string().max(160),
  factId: z.string().max(80).nullable(),
  tool: toolNameSchema.nullable(),
});
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

/** What the user sends to save an insight. */
export const newSavedInsightSchema = z.object({
  hotelId: z.string().min(1).max(64),
  /** Saving the same thing twice ("briefing:pace:2026-11-21:2026-11-30", "answer:<runId>") keeps one record. */
  sourceKey: z.string().min(1).max(160),
  origin: z.enum(['briefing', 'answer']),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1200),
  metric: metricIdSchema.nullable(),
  measure: savedMeasureSchema.nullable(),
  period: dateRangeSchema.nullable(),
  evidence: z.array(evidenceReferenceSchema).max(12),
  /** The conversation the insight came from, to open it again as it was. */
  sourceConversationId: conversationIdSchema.nullable(),
  /** The question and context that investigate it again, on today's data. */
  investigation: z.object({ question: z.string().max(280), context: investigationContextSchema.nullable() }).nullable(),
});
export type NewSavedInsight = z.infer<typeof newSavedInsightSchema>;

export const savedInsightSchema = newSavedInsightSchema.extend({
  id: recordIdSchema,
  createdAt: z.string(),
});
export type SavedInsight = z.infer<typeof savedInsightSchema>;

export const ACTION_STATUSES = ['todo', 'in_progress', 'completed', 'dismissed'] as const;
export const actionStatusSchema = z.enum(ACTION_STATUSES);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
  dismissed: 'Dismissed',
};

export const ACTION_PRIORITIES = ['high', 'medium', 'low'] as const;
export const actionPrioritySchema = z.enum(ACTION_PRIORITIES);
export type ActionPriority = z.infer<typeof actionPrioritySchema>;

const editableActionFields = {
  title: z.string().trim().min(1, 'Give the action a title').max(160),
  description: z.string().max(1200),
  priority: actionPrioritySchema,
  status: actionStatusSchema,
  owner: z.string().trim().max(80).nullable(),
  dueDate: isoDateSchema.nullable(),
  notes: z.string().max(2000),
};

/** What the user sends to create an action. */
export const newDecisionActionSchema = z.object({
  hotelId: z.string().min(1).max(64),
  insightId: recordIdSchema,
  ...editableActionFields,
  /** True when the user started from Aurora's suggestion (it stays a suggestion until they save it). */
  startedFromSuggestion: z.boolean(),
});
export type NewDecisionAction = z.infer<typeof newDecisionActionSchema>;

/** PATCH: any editable field. */
export const decisionActionPatchSchema = z.object(editableActionFields).partial();
export type DecisionActionPatch = z.infer<typeof decisionActionPatchSchema>;

export const decisionActionSchema = newDecisionActionSchema.extend({
  id: recordIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Set when the status becomes completed, cleared if it is reopened. */
  completedAt: z.string().nullable(),
});
export type DecisionAction = z.infer<typeof decisionActionSchema>;

/**
 * What the data shows after an action was completed. "Observed" is a change in
 * the figure, side by side; it never says the action caused it.
 */
export const actionOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('not_measurable'),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('observed'),
    label: z.string(),
    unit: z.enum(['currency', 'ratio', 'count']),
    before: z.number(),
    /** "When saved, 1–17 Nov 2026". */
    beforeLabel: z.string(),
    after: z.number(),
    /** "Since completed, 18–25 Nov 2026". */
    afterLabel: z.string(),
  }),
]);
export type ActionOutcome = z.infer<typeof actionOutcomeSchema>;

/** GET /api/decisions */
export const decisionsSchema = z.object({
  insights: z.array(savedInsightSchema),
  actions: z.array(decisionActionSchema),
  /** For completed actions, by action id. */
  outcomes: z.record(z.string(), actionOutcomeSchema),
  /** Stored records that could not be read (an older or damaged format). */
  unreadableRecordCount: z.number().int().nonnegative(),
});
export type Decisions = z.infer<typeof decisionsSchema>;
