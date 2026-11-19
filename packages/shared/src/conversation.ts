import { z } from 'zod';
import { conversationIdSchema, streamEventSchema } from './stream-events';

// ---------------------------------------------------------------------------
// Saved conversations. Every finished answer is stored with the exact events
// that were streamed, so opening an old conversation shows the same answer
// at once, without running the tools or the model again.
// ---------------------------------------------------------------------------

/** One question and the events of its answer. */
export const storedTurnSchema = z.object({
  question: z.string(),
  events: z.array(streamEventSchema),
  createdAt: z.string(),
});
export type StoredTurn = z.infer<typeof storedTurnSchema>;

/** A row of the sidebar's "Recent" list. */
export const conversationSummarySchema = z.object({
  id: conversationIdSchema,
  hotelId: z.string(),
  /** The first question about the hotel's data, or the first message. */
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  turnCount: z.number().int().nonnegative(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** GET /api/conversations/:id */
export const conversationSchema = conversationSummarySchema.extend({ turns: z.array(storedTurnSchema) });
export type Conversation = z.infer<typeof conversationSchema>;

/** GET /api/conversations?hotel=… */
export const conversationListSchema = z.object({ conversations: z.array(conversationSummarySchema) });
