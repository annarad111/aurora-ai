import type { ToolName } from '@aurora/shared';
import type { LanguageModel } from '../llm/language-model';
import type { AnalysisContext } from './analysis-context';
import { buildFigureCatalogue } from './figure-catalogue';
import type { InsightIntent } from './insight-plan';
import { checkAndRenderNarrative } from './narrative-guard';
import type { InsightDraft, NarrativeResult, NarrativeWriter } from './narrative-writer';
import { buildNarrativeRequest, NARRATIVE_SYSTEM_PROMPT } from './prompts';
import { ScriptedNarrativeWriter } from './scripted-narrative-writer';

/** First try, plus one retry that tells the model what was wrong. */
const MAXIMUM_ATTEMPTS = 2;

/**
 * The language model writes the explanation; everything else stays deterministic.
 *
 *   headline, chips, follow-ups  from the templates (they appear before the model has answered)
 *   explanation                  from the model, checked by the number guard
 *
 * If the model fails, times out or breaks the rules twice, the templates write
 * the explanation and the done event says so.
 */
export class LanguageModelNarrativeWriter implements NarrativeWriter {
  constructor(
    private readonly model: LanguageModel,
    private readonly fallback: NarrativeWriter = new ScriptedNarrativeWriter(),
  ) {}

  headlineDependsOn(intent: InsightIntent): ToolName[] {
    return this.fallback.headlineDependsOn(intent);
  }

  writeInsight(intent: InsightIntent, analysis: AnalysisContext): InsightDraft {
    return this.fallback.writeInsight(intent, analysis);
  }

  suggestFollowups(intent: InsightIntent, analysis: AnalysisContext): string[] {
    return this.fallback.suggestFollowups(intent, analysis);
  }

  async writeExplanation(intent: InsightIntent, analysis: AnalysisContext, signal: AbortSignal): Promise<NarrativeResult> {
    const catalogue = buildFigureCatalogue(analysis);
    let problemsWithPreviousAnswer: string[] = [];
    let fallbackReason = 'The model answer did not pass the number guard';

    for (let attempt = 1; attempt <= MAXIMUM_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.model.complete(
          {
            system: NARRATIVE_SYSTEM_PROMPT,
            user: buildNarrativeRequest(analysis.question, catalogue, problemsWithPreviousAnswer, analysis.followUpOf),
            maxTokens: 450,
            temperature: 0.3,
          },
          signal,
        );
        const guardResult = checkAndRenderNarrative(response.text, catalogue);
        if (guardResult.isValid) return { provider: 'llm', segments: guardResult.segments };

        problemsWithPreviousAnswer = guardResult.problems;
        console.warn(`[Aurora] model answer rejected (attempt ${attempt}):`, guardResult.problems);
      } catch (error) {
        // A failing model will not do better on a retry within the same answer.
        fallbackReason = error instanceof Error ? error.message : String(error);
        console.warn('[Aurora] model failed, using templates:', fallbackReason);
        break;
      }
    }

    const scriptedResult = await this.fallback.writeExplanation(intent, analysis, signal);
    return { ...scriptedResult, fallbackReason };
  }
}
