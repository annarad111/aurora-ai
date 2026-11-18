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

/** The written explanation, and who actually wrote it. */
export interface NarrativeResult {
  provider: 'llm' | 'scripted';
  segments: NarrativeSegment[];
  /** Set when the model was asked but the templates were used instead, and why. */
  fallbackReason?: string;
}

/**
 * Writes the words around the numbers. Two implementations:
 *   ScriptedNarrativeWriter        deterministic templates
 *   LanguageModelNarrativeWriter   Workers AI, constrained by the number guard, falling back to the templates
 */
export interface NarrativeWriter {
  /** Tools the headline depends on. The insight event goes out once all of them have answered. */
  headlineDependsOn(intent: InsightIntent): ToolName[];
  writeInsight(intent: InsightIntent, analysis: AnalysisContext): InsightDraft;
  writeExplanation(intent: InsightIntent, analysis: AnalysisContext, signal: AbortSignal): Promise<NarrativeResult>;
  suggestFollowups(intent: InsightIntent, analysis: AnalysisContext): string[];
}
