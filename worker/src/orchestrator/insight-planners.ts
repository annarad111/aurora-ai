import { TOOL_NAMES, type ToolName } from '@aurora/shared';
import type { LanguageModel } from '../llm/language-model';
import { TOOL_DEFINITIONS } from '../tools/registry';
import { planFromToolNames, planInsightRun, type InsightPlan } from './insight-plan';
import { buildPlannerRequest, PLANNER_SYSTEM_PROMPT } from './prompts';

export interface PlannedRun extends InsightPlan {
  plannedBy: 'llm' | 'keywords';
}

/** Decides which tools a question needs. */
export interface InsightPlanner {
  plan(question: string, signal: AbortSignal): Promise<PlannedRun>;
}

/** Keyword rules. Instant and deterministic; also the fallback of the model planner. */
export class KeywordInsightPlanner implements InsightPlanner {
  async plan(question: string): Promise<PlannedRun> {
    return { ...planInsightRun(question), plannedBy: 'keywords' };
  }
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * The language model chooses tools through function calling. If it fails,
 * is slow, or calls no known tool, the keyword rules decide instead.
 */
export class LanguageModelInsightPlanner implements InsightPlanner {
  constructor(
    private readonly model: LanguageModel,
    private readonly fallback: InsightPlanner = new KeywordInsightPlanner(),
  ) {}

  async plan(question: string, signal: AbortSignal): Promise<PlannedRun> {
    try {
      const response = await this.model.complete(
        {
          system: PLANNER_SYSTEM_PROMPT,
          user: buildPlannerRequest(question),
          tools: TOOL_DEFINITIONS.map((tool) => ({ name: tool.name, description: tool.description })),
          maxTokens: 200,
          temperature: 0,
        },
        signal,
      );
      const chosenTools = response.toolNames.filter(isToolName);
      if (chosenTools.length === 0) throw new Error('The model called no known tool');
      return { ...planFromToolNames(chosenTools), plannedBy: 'llm' };
    } catch (error) {
      console.warn('[Aurora] tool planning fell back to keyword rules:', error instanceof Error ? error.message : error);
      return this.fallback.plan(question, signal);
    }
  }
}
