import { z } from 'zod';
import { dateRangeSchema, hotelSchema, isoDateSchema } from './domain';

/** A question Aurora suggests, with a short topic tag. */
export const suggestionSchema = z.object({ topic: z.string(), question: z.string() });
export type Suggestion = z.infer<typeof suggestionSchema>;

// ---------------------------------------------------------------------------
// GET /api/workspace: everything the UI shows before a question is asked.
// The web app has no hotel data of its own; it all comes from here.
// ---------------------------------------------------------------------------

export const workspaceSchema = z.object({
  /** Every hotel the user can pick from. */
  hotels: z.array(hotelSchema),
  /** The hotel this workspace is about. */
  hotel: hotelSchema,
  today: isoDateSchema,
  /** The period answers are about (month to date). */
  period: dateRangeSchema,
  /** Starter questions, written from what the data shows today (the biggest gap, weak pace, a cancelled block…). */
  suggestions: z.array(suggestionSchema),
  mcp: z.object({ endpoint: z.string(), toolCount: z.number().int() }),
});
export type Workspace = z.infer<typeof workspaceSchema>;
