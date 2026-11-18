import { z } from 'zod';
import { dateRangeSchema, hotelSchema, isoDateSchema } from './domain';

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
  suggestedQuestions: z.array(z.object({ topic: z.string(), question: z.string() })),
  /** The latest distinct questions asked for this hotel, newest first. */
  recentQuestions: z.array(z.object({ question: z.string(), askedAt: z.string() })),
  mcp: z.object({ endpoint: z.string(), toolCount: z.number().int() }),
});
export type Workspace = z.infer<typeof workspaceSchema>;
