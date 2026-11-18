import type { StreamEventOfType, ToolName } from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import type { InsightIntent } from './insight-plan';

/**
 * A piece of the explanation. Without `factId` it is plain text. With `factId`
 * it is a figure ("245 fewer room nights") that the UI renders as a button
 * linked to its provenance.
 */
export interface NarrativeSegment {
  text: string;
  factId?: string;
}

export type InsightDraft = Pick<StreamEventOfType<'insight'>, 'headline' | 'impactEur' | 'factIds' | 'chips'>;

/**
 * Writes the words around the numbers. Two implementations:
 *   ScriptedNarrativeWriter  deterministic templates (this step, and the fallback later)
 *   LLM writer               Workers AI, constrained to the same facts (step 8)
 */
export interface NarrativeWriter {
  readonly provider: 'llm' | 'scripted';
  /** Tools the headline depends on. The insight event goes out once all of them have answered. */
  headlineDependsOn(intent: InsightIntent): ToolName[];
  writeInsight(intent: InsightIntent, analysis: AnalysisContext): InsightDraft;
  writeExplanation(intent: InsightIntent, analysis: AnalysisContext): AsyncIterable<NarrativeSegment>;
  suggestFollowups(intent: InsightIntent, analysis: AnalysisContext): string[];
}
