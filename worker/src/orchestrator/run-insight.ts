import { queryPerformanceInputSchema, type ConversationTurn, type InvestigationContext, type IsoDate, type ToolName } from '@aurora/shared';
import type { EmitStreamEvent } from '../sse/sse-event-stream';
import { callTool } from '../tools/registry';
import { requireHotel, ToolInputError, type ToolContext } from '../tools/tool-context';
import { monthToDate, paceWindowFor, type AnalysisContext, type ToolResults } from './analysis-context';
import { describeAnsweredContext } from './follow-up';
import { buildInsightTrail } from './insight-trail';
import { planForInvestigation, type RunStepPlan } from './insight-plan';
import { buildSuggestions } from './suggestions';
import { writeConversationReply } from './conversation';
import { isConversationPlan, isDecisionsPlan, KeywordInsightPlanner, type InsightPlanner, type PlannedRun } from './insight-planners';
import { toolInputFor, writeDecisionsAnswer } from './decisions-answer';
import type { NarrativeWriter } from './narrative-writer';
import { pause } from './pause';
import { buildProvenance, listKnownFactIds } from './provenance';
import { ScriptedNarrativeWriter } from './scripted-narrative-writer';
import { buildEventsAfterTool } from './tool-events';

// ---------------------------------------------------------------------------
// One answer, from question to "done".
//
//   1. run_started, the planner chooses the tools, then every planned step as "pending"
//   2. for each tool: step running → call the tool → step done → KPI and chart events
//      (the main finding goes out as soon as the tools behind its headline have answered)
//   3. the explanation, word by word, with figures tagged by fact id
//   4. provenance for every figure, then follow-ups, then done
//
// The order is a UX decision: the summary comes before the details, and every
// step says what is happening.
// ---------------------------------------------------------------------------

export interface StreamPacing {
  stepDelayMs: number;
  textTokenDelayMs: number;
}

export interface RunInsightOptions {
  question: string;
  hotelId: string;
  toolContext: ToolContext;
  emit: EmitStreamEvent;
  /** Aborted by Stop in the UI, or when the client disconnects. */
  signal: AbortSignal;
  pacing: StreamPacing;
  /** Chooses the tools. Defaults to the keyword rules. */
  planner?: InsightPlanner;
  /** Writes the explanation. Defaults to the templates. */
  narrativeWriter?: NarrativeWriter;
  /** Earlier questions of the conversation and what their answers covered, oldest first. */
  history?: ConversationTurn[];
  /** Set when the question was opened from the briefing: runs exactly that analysis, no planning. */
  investigation?: InvestigationContext;
}

/**
 * Pace looks at the rest of the current month. When the analysis is about an
 * earlier month ("why was October below target?"), that outlook is about other
 * nights, so it is left out.
 */
export function withoutPaceForPastPeriods<Plan extends PlannedRun>(plan: Plan, today: IsoDate): Plan {
  const isEarlierMonth = plan.periodOverride && plan.periodOverride.to < monthToDate(today).from;
  if (!isEarlierMonth || plan.intent === 'booking_pace') return plan;
  return { ...plan, steps: plan.steps.filter((step) => step.tool !== 'get_booking_pace') };
}

/** Splits text into words, keeping the trailing spaces, so streamed words join back exactly. */
export function splitIntoWords(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export async function runInsight(options: RunInsightOptions): Promise<void> {
  const { question, hotelId, toolContext, emit, signal, pacing } = options;
  const narrativeWriter = options.narrativeWriter ?? new ScriptedNarrativeWriter();
  const planner = options.planner ?? new KeywordInsightPlanner();
  const startedAt = Date.now();

  const { investigation } = options;
  await emit({ type: 'run_started', question, hotelId, ...(investigation ? { investigation } : {}) });

  try {
    const hotel = await requireHotel(toolContext, hotelId);
    const planResult: Awaited<ReturnType<InsightPlanner['plan']>> = investigation
      ? { ...planForInvestigation(investigation, toolContext.today), plannedBy: 'context' }
      : await planner.plan(question, signal, { today: toolContext.today, history: options.history ?? [] });
    if (signal.aborted) return;

    // --- A reply in words: a greeting, thanks, or a message outside the hotel's business ---
    if (isConversationPlan(planResult)) {
      const reply = planResult.modelReply ?? writeConversationReply(planResult.reason, hotel);
      for (const word of splitIntoWords(reply)) {
        if (signal.aborted) return;
        await emit({ type: 'text_delta', text: word });
        await pause(pacing.textTokenDelayMs, signal);
      }
      const suggestions = await buildSuggestions(toolContext, hotel);
      if (signal.aborted) return;
      await emit({ type: 'followups', questions: suggestions.map((suggestion) => suggestion.question) });
      await emit({
        type: 'done',
        durationMs: Date.now() - startedAt,
        provider: planResult.modelReply ? 'llm' : 'scripted',
        toolsChosenBy: planResult.plannedBy,
        verifiedFigureCount: 0,
        answerKind: 'conversation',
      });
      return;
    }

    // --- The saved decisions: read from the Decisions workspace, answered by fixed rules ---
    if (isDecisionsPlan(planResult)) {
      const step = { stepId: 'decisions', label: 'Reading your saved decisions', tool: 'get_decisions' } as const;
      await emit({ type: 'step', ...step, status: 'pending' });
      await emit({ type: 'step', ...step, status: 'running' });
      await pause(pacing.stepDelayMs, signal);
      if (signal.aborted) return;
      const output = await callTool('get_decisions', toolInputFor(hotel.id, planResult.focus), toolContext);
      await emit({ type: 'step', ...step, status: 'done' });
      const answer = writeDecisionsAnswer(output, planResult.focus);
      await emit({ type: 'insight', headline: answer.headline, impactEur: null, factIds: ['decisions'], chips: [] });
      await emit({ type: 'trail', stages: answer.trail });
      for (const word of splitIntoWords(answer.text)) {
        if (signal.aborted) return;
        await emit({ type: 'text_delta', text: word });
        await pause(pacing.textTokenDelayMs, signal);
      }
      await emit({
        type: 'provenance',
        factId: 'decisions',
        title: 'Saved decisions',
        displayValue: `${output.counts.savedInsights} insights, ${output.counts.todo + output.counts.inProgress} open actions`,
        tool: 'get_decisions',
        formula: 'Saved insights and actions, as recorded in the Decisions workspace; overdue = open with a due date before today',
        inputs: [
          { label: 'Saved insights', value: String(output.counts.savedInsights) },
          { label: 'To do', value: String(output.counts.todo) },
          { label: 'In progress', value: String(output.counts.inProgress) },
          { label: 'Completed', value: String(output.counts.completed) },
          { label: 'Dismissed', value: String(output.counts.dismissed) },
          { label: 'Overdue', value: String(output.counts.overdue) },
          { label: 'Today', value: output.today },
        ],
        sourceQuery: `decision_records WHERE hotel_id = ${hotel.id}`,
        contextLabel: 'Saved decisions',
        contextText: answer.contextText,
        exploreView: null,
        followupQuestions: answer.followups,
      });
      if (answer.followups.length > 0) await emit({ type: 'followups', questions: answer.followups });
      await emit({
        type: 'done',
        durationMs: Date.now() - startedAt,
        provider: 'scripted',
        toolsChosenBy: planResult.plannedBy,
        verifiedFigureCount: 0,
        answerKind: 'analysis',
      });
      return;
    }

    const plan = withoutPaceForPastPeriods(planResult, toolContext.today);
    const analysis: AnalysisContext = {
      question,
      hotel,
      period: plan.periodOverride ?? monthToDate(toolContext.today),
      paceWindow: plan.paceWindowOverride ?? paceWindowFor(toolContext.today),
      results: {},
      ...(plan.dataFocus ? { dataFocus: plan.dataFocus } : {}),
      ...(plan.followUpOf ? { followUpOf: plan.followUpOf } : {}),
    };

    for (const step of plan.steps) {
      await emit({ type: 'step', stepId: step.stepId, label: step.label, tool: step.tool, status: 'pending' });
    }

    // --- Tools ---------------------------------------------------------------
    const headlineTools = narrativeWriter.headlineDependsOn(plan.intent);
    let insightSent = false;

    for (const step of plan.steps) {
      if (signal.aborted) return;
      await emit({ type: 'step', stepId: step.stepId, label: step.label, tool: step.tool, status: 'running' });
      await pause(pacing.stepDelayMs, signal);
      if (signal.aborted) return;

      try {
        await runToolIntoResults(step, analysis, toolContext);
      } catch (error) {
        await emit({ type: 'step', stepId: step.stepId, label: step.label, tool: step.tool, status: 'failed' });
        throw error;
      }
      await emit({ type: 'step', stepId: step.stepId, label: step.label, tool: step.tool, status: 'done' });

      for (const event of buildEventsAfterTool(step.tool, analysis)) {
        await emit(event);
      }

      if (!insightSent && headlineTools.every((tool) => hasResultFor(tool, analysis.results))) {
        await emit({ type: 'insight', ...narrativeWriter.writeInsight(plan.intent, analysis) });
        insightSent = true;
      }
    }
    if (!insightSent) {
      await emit({ type: 'insight', ...narrativeWriter.writeInsight(plan.intent, analysis) });
    }

    // --- The insight trail: the reasoning in four plain steps, before the text ---
    const followupQuestions = narrativeWriter.suggestFollowups(plan.intent, analysis);
    const trailStages = buildInsightTrail(plan.intent, analysis, followupQuestions);
    if (trailStages.length > 0) await emit({ type: 'trail', stages: trailStages });

    // --- Explanation, word by word --------------------------------------------
    // The whole explanation is checked before any of it is shown, so a rejected
    // model answer never flashes on screen.
    const narrative = await narrativeWriter.writeExplanation(plan.intent, analysis, signal);
    if (signal.aborted) return;
    const figureFactIds = new Set<string>();
    for (const segment of narrative.segments) {
      if (signal.aborted) return;
      if (segment.factId) {
        // A figure is sent whole, so the UI can render it as one button.
        figureFactIds.add(segment.factId);
        await emit({ type: 'text_delta', text: segment.text, factId: segment.factId });
        await pause(pacing.textTokenDelayMs, signal);
        continue;
      }
      for (const word of splitIntoWords(segment.text)) {
        if (signal.aborted) return;
        await emit({ type: 'text_delta', text: word });
        await pause(pacing.textTokenDelayMs, signal);
      }
    }

    // --- Provenance for every figure, chip, KPI card and chart bar ------------------
    let verifiedFigureCount = 0;
    for (const factId of new Set([...figureFactIds, ...listKnownFactIds(analysis)])) {
      const provenance = buildProvenance(factId, analysis);
      if (!provenance) continue;
      if (figureFactIds.has(factId)) verifiedFigureCount += 1;
      await emit({ type: 'provenance', ...provenance });
    }

    await emit({ type: 'followups', questions: followupQuestions });
    await emit({
      type: 'done',
      durationMs: Date.now() - startedAt,
      provider: narrative.provider,
      toolsChosenBy: plan.plannedBy,
      ...(narrative.fallbackReason ? { fallbackReason: narrative.fallbackReason } : {}),
      verifiedFigureCount,
      answerKind: 'analysis',
      context: describeAnsweredContext(plan, analysis),
      ...(plan.followUpOf ? { followUpOf: plan.followUpOf } : {}),
    });
  } catch (error) {
    if (signal.aborted) return;
    if (error instanceof ToolInputError) {
      await emit({ type: 'error', code: error.code, message: error.message, recoverable: false });
      return;
    }
    console.error('[Aurora] run failed', error);
    await emit({ type: 'error', code: 'internal_error', message: 'Aurora could not finish this answer. Please try again.', recoverable: true });
  }
}

async function runToolIntoResults(step: RunStepPlan, analysis: AnalysisContext, toolContext: ToolContext): Promise<void> {
  const hotelId = analysis.hotel.id;
  const periodInput = { hotelId, period: analysis.period };
  switch (step.tool) {
    case 'get_hotel_overview':
      analysis.results.overview = await callTool('get_hotel_overview', periodInput, toolContext);
      return;
    case 'analyze_revenue_drivers':
      analysis.results.drivers = await callTool('analyze_revenue_drivers', periodInput, toolContext);
      return;
    case 'get_channel_mix':
      analysis.results.channelMix = await callTool('get_channel_mix', periodInput, toolContext);
      return;
    case 'get_booking_pace':
      analysis.results.pace = await callTool(
        'get_booking_pace',
        { hotelId, stayFrom: analysis.paceWindow.from, stayTo: analysis.paceWindow.to },
        toolContext,
      );
      return;
    case 'query_performance': {
      // The hotel always comes from the run, never from the question or the model.
      const input = queryPerformanceInputSchema.parse({ ...step.input, hotelId });
      const output = await callTool('query_performance', input, toolContext);
      analysis.results.queries = [...(analysis.results.queries ?? []), { input, output }];
      return;
    }
    case 'get_group_blocks':
      analysis.results.groupBlocks = await callTool('get_group_blocks', { period: analysis.period, ...step.input, hotelId }, toolContext);
      return;
  }
}

function hasResultFor(tool: ToolName, results: ToolResults): boolean {
  const resultForTool: Record<ToolName, unknown> = {
    get_hotel_overview: results.overview,
    analyze_revenue_drivers: results.drivers,
    get_channel_mix: results.channelMix,
    get_booking_pace: results.pace,
    query_performance: results.queries?.[0],
    get_group_blocks: results.groupBlocks,
    // The chat never plans the what-if (it has its own screen), and decisions have their own answer.
    simulate_scenario: undefined,
    get_decisions: undefined,
  };
  return resultForTool[tool] !== undefined;
}
