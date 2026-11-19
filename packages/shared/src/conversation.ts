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

/** PATCH /api/conversations/:id?hotel=… : the user's own title. */
export const MAXIMUM_CONVERSATION_TITLE_LENGTH = 70;
export const renameConversationSchema = z.object({
  title: z.string().trim().min(1, 'The title cannot be empty').max(MAXIMUM_CONVERSATION_TITLE_LENGTH),
});

/** GET /api/conversations?hotel=… */
export const conversationListSchema = z.object({ conversations: z.array(conversationSummarySchema) });
