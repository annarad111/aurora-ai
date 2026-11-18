import { z } from 'zod';
import { metricIdSchema } from './metric-meta';

// ---------------------------------------------------------------------------
// A finding is one fact the analysis discovered, with its impact in euros.
// Findings are the ONLY input the language model gets for writing the
// narrative, so every number in the text can be traced back to one of them.
// ---------------------------------------------------------------------------

export const findingEvidenceSchema = z.object({
  label: z.string(),
  value: z.number(),
});
export type FindingEvidence = z.infer<typeof findingEvidenceSchema>;

export const findingSchema = z.object({
  /** Stable identifier, e.g. "volume", "volume_mice", "commission_cost". Figures in the text link to it. */
  id: z.string(),
  metric: metricIdSchema,
  /** Short human description: "Volume effect", "MICE volume". */
  title: z.string(),
  /** The main number of the finding (euros, a ratio or a count, depending on the metric). */
  value: z.number(),
  /** Difference to the reference (target or last year), same unit as `value`. */
  delta: z.number(),
  /** Effect on room revenue in euros. Negative means it widens the gap. Used for ranking. */
  impactEur: z.number(),
  /** The numbers the finding was computed from, shown in "How was this calculated?". */
  evidence: z.array(findingEvidenceSchema),
});
export type Finding = z.infer<typeof findingSchema>;
