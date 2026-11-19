import { queryPerformanceInputSchema, type ConversationTurn, type InvestigationContext, type IsoDate, type ToolName, type TrailStage } from '@aurora/shared';
import type { EmitStreamEvent } from '../sse/sse-event-stream';
import { callTool } from '../tools/registry';
import { requireHotel, ToolInputError, type ToolContext } from '../tools/tool-context';
import { monthToDate, paceWindowFor, previousCompletedMonth, type AnalysisContext, type ToolResults } from './analysis-context';
import { describeAnsweredContext } from './follow-up';
import { buildInsightTrail } from './insight-trail';
import { planForInvestigation, type RunStepPlan } from './insight-plan';
import { buildSuggestions } from './suggestions';
import { writeConversationReply } from './conversation';
import { isConversationPlan, isDecisionsPlan, isPropertyPlan, isWhatIfPlan, KeywordInsightPlanner, type InsightPlanner, type PlannedRun } from './insight-planners';
import { writeMaintenanceImpactAnswer, writePropertyAnswer } from './property-answer';
import { whatIfWindow, writeWhatIfAnswer } from './what-if-answer';
import { describeNights } from './derived-facts';
import type { StreamEventPayload } from '../sse/sse-event-stream';
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

/**
 * A data answer about exactly the previous completed month ("revenue last month") is what the
 * Property Overview's financial snapshot shows: its last step links there.
 */
export function withFinancialSnapshotLink(stages: TrailStage[], analysis: AnalysisContext, today: IsoDate): TrailStage[] {
  const queriedPeriod = analysis.results.queries?.[0]?.output.period;
  const previousMonth = previousCompletedMonth(today);
  if (!queriedPeriod || queriedPeriod.from !== previousMonth.from || queriedPeriod.to !== previousMonth.to) return stages;
  return stages.map((stage) =>
    stage.stage === 'decision'
      ? { ...stage, text: 'The property overview shows this month next to the months before it.', action: { kind: 'navigate', label: 'See the financial snapshot', destination: 'property', section: 'financials' } }
      : stage,
  );
}

/**
 * After an answer about the coming nights (pace, or the revenue gap with its pace outlook), one
 * follow-up offers the what-if, so users learn they can ask Aurora for one.
 */
export function withWhatIfFollowUp(followups: string[], intent: string, analysis: AnalysisContext): string[] {
  const pace = analysis.results.pace;
  if (!pace || (intent !== 'booking_pace' && intent !== 'revenue_gap') || pace.roomsOnTheBooks >= pace.roomsOnTheBooksLastYear) return followups;
  const whatIf = `What if we win back half the gap for ${describeNights({ from: pace.stayFrom, to: pace.stayTo })}?`;
  return [followups[0], whatIf, ...followups.slice(1)].filter((question): question is string => Boolean(question)).slice(0, 4);
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
      ? investigation.intent === 'maintenance_impact'
        ? {
            kind: 'property',
            focus: {
              kind: 'maintenance_impact',
              ...(investigation.eventId ? { eventId: investigation.eventId } : {}),
              ...(investigation.roomNumbers?.length === 1 ? { roomNumber: investigation.roomNumbers[0]! } : {}),
            },
            plannedBy: 'context',
          }
        : { ...planForInvestigation(investigation, toolContext.today), plannedBy: 'context' }
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

    /** An answer written by fixed rules from one tool: step, finding, trail, text, provenance, follow-ups, done. */
    async function emitWrittenAnswer(spec: {
      step: { stepId: string; label: string; tool: ToolName };
      read: () => Promise<{
        answer: { headline: string; text: string; trail: TrailStage[]; followups: string[]; contextText: string };
        factId: string;
        provenance: { title: string; displayValue: string; formula: string; inputs: Array<{ label: string; value: string }>; sourceQuery: string; contextLabel: string };
        /** Charts or KPIs that go out right after the step (the pace chart of a what-if). */
        events?: StreamEventPayload[];
      }>;
      plannedBy: 'llm' | 'keywords' | 'context';
    }) {
      await emit({ type: 'step', ...spec.step, status: 'pending' });
      await emit({ type: 'step', ...spec.step, status: 'running' });
      await pause(pacing.stepDelayMs, signal);
      if (signal.aborted) return;
      let result;
      try {
        result = await spec.read();
      } catch (error) {
        await emit({ type: 'step', ...spec.step, status: 'failed' });
        throw error;
      }
      await emit({ type: 'step', ...spec.step, status: 'done' });
      const { answer, factId, provenance } = result;
      for (const event of result.events ?? []) await emit(event);
      await emit({ type: 'insight', headline: answer.headline, impactEur: null, factIds: [factId], chips: [] });
      await emit({ type: 'trail', stages: answer.trail });
      for (const word of splitIntoWords(answer.text)) {
        if (signal.aborted) return;
        await emit({ type: 'text_delta', text: word });
        await pause(pacing.textTokenDelayMs, signal);
      }
      await emit({
        type: 'provenance',
        factId,
        tool: spec.step.tool,
        ...provenance,
        contextText: answer.contextText,
        exploreView: null,
        followupQuestions: answer.followups,
      });
      if (answer.followups.length > 0) await emit({ type: 'followups', questions: answer.followups });
      await emit({ type: 'done', durationMs: Date.now() - startedAt, provider: 'scripted', toolsChosenBy: spec.plannedBy, verifiedFigureCount: 0, answerKind: 'analysis' });
    }

    // --- The saved decisions: read from the Decisions workspace, answered by fixed rules ---
    if (isDecisionsPlan(planResult)) {
      await emitWrittenAnswer({
        step: { stepId: 'decisions', label: 'Reading your saved decisions', tool: 'get_decisions' },
        read: async () => {
          const output = await callTool('get_decisions', toolInputFor(hotel.id, planResult.focus), toolContext);
          const answer = writeDecisionsAnswer(output, planResult.focus);
          return {
            answer,
            factId: 'decisions',
            provenance: {
              title: 'Saved decisions',
              displayValue: `${output.counts.savedInsights} insights, ${output.counts.todo + output.counts.inProgress} open actions`,
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
            },
          };
        },
        plannedBy: planResult.plannedBy,
      });
      return;
    }

    // --- A what-if: simulate_scenario on the bookings on the books, answered by fixed rules ---
    if (isWhatIfPlan(planResult)) {
      const { focus } = planResult;
      const window = whatIfWindow(focus, toolContext.today);
      await emitWrittenAnswer({
        step: { stepId: 'what_if', label: 'Running the what-if on the bookings on the books', tool: 'simulate_scenario' },
        read: async () => {
          const input = { hotelId: hotel.id, stayFrom: window.from, stayTo: window.to };
          const [result, pace] = await Promise.all([
            callTool('simulate_scenario', { ...input, ...focus.levers }, toolContext),
            callTool('get_booking_pace', { hotelId: hotel.id, stayFrom: window.from, stayTo: window.to }, toolContext),
          ]);
          // A rate alone only moves rooms still to sell: show it with half the gap won back as well.
          const onlyRate = focus.levers.rateChange !== 0 && focus.levers.paceRecovery === 0 && focus.levers.otaToDirect === 0;
          const combined = onlyRate ? await callTool('simulate_scenario', { ...input, paceRecovery: 0.5, rateChange: focus.levers.rateChange, otaToDirect: 0 }, toolContext) : null;
          const answer = writeWhatIfAnswer(result, focus, combined);
          const { outcome } = result;
          return {
            answer,
            factId: 'what_if',
            provenance: {
              title: 'What-if on the bookings on the books',
              displayValue: `${outcome.effects.netChange >= 0 ? '+' : '−'}€${Math.abs(Math.round(outcome.effects.netChange)).toLocaleString('en-GB')} net revenue`,
              formula:
                'recovered nights = room nights behind last year × pace recovery (capped by capacity); new revenue at the rate on the books × (1 + rate change); commission by channel mix; direct saves the OTA commission on the share moved',
              inputs: [
                { label: 'Stay dates', value: `${result.basis.stayFrom} to ${result.basis.stayTo}` },
                { label: 'On the books', value: `${result.basis.roomsOnTheBooks} room nights` },
                { label: 'Behind last year', value: `${outcome.roomNightsBehindLastYear} room nights` },
                { label: 'Pace recovery', value: `${Math.round(result.levers.paceRecovery * 100)}%` },
                { label: 'Rate change', value: `${Math.round(result.levers.rateChange * 100)}%` },
                { label: 'OTA to direct', value: `${Math.round(result.levers.otaToDirect * 100)}%` },
                { label: 'Net revenue change', value: `€${Math.round(outcome.effects.netChange).toLocaleString('en-GB')}` },
              ],
              sourceQuery: `on_the_books (snapshot ${toolContext.today}) for ${window.from} to ${window.to}, channel mix of the month so far`,
              contextLabel: 'What-if',
            },
            events: [{ type: 'chart', chart: { kind: 'booking_pace', data: pace }, factIds: ['booking_pace'] }],
          };
        },
        plannedBy: planResult.plannedBy,
      });
      return;
    }

    // --- Maintenance and what it cost: read from get_room_events, answered by fixed rules ---
    if (isPropertyPlan(planResult) && planResult.focus.kind === 'maintenance_impact') {
      const { focus } = planResult;
      await emitWrittenAnswer({
        step: { stepId: 'room_events', label: 'Checking maintenance and full nights', tool: 'get_room_events' },
        read: async () => {
          const output = await callTool(
            'get_room_events',
            { hotelId: hotel.id, ...(focus.eventId ? { eventId: focus.eventId } : {}), ...(focus.roomNumber ? { roomNumber: focus.roomNumber } : {}) },
            toolContext,
          );
          const answer = writeMaintenanceImpactAnswer(output, focus);
          const roomNights = output.events.reduce((sum, event) => sum + event.impact.roomNights, 0);
          return {
            answer,
            factId: 'room_events',
            provenance: {
              title: 'Maintenance and full nights',
              displayValue: `${roomNights} room nights unsellable`,
              formula: 'per night: vacant = physical rooms − rooms sold (or booked so far) − rooms out of order or out of service; a full night has no vacant room',
              inputs: output.events.map((event) => ({
                label: `${event.roomNumbers.join(', ')} · ${event.firstNight} to ${event.lastNight}`,
                value: `${event.impact.roomNights} room nights, ${event.impact.nightsFull} full nights`,
              })),
              sourceQuery: `room_status_events + daily_stats (past nights) + on_the_books (snapshot ${output.today}) for ${output.window.from} to ${output.window.to}`,
              contextLabel: 'Maintenance and full nights',
            },
          };
        },
        plannedBy: planResult.plannedBy,
      });
      return;
    }

    // --- The property's rooms for one night: read from get_property_status, answered by fixed rules ---
    if (isPropertyPlan(planResult)) {
      await emitWrittenAnswer({
        step: { stepId: 'property', label: 'Checking the rooms', tool: 'get_property_status' },
        read: async () => {
          const { focus } = planResult;
          const status = await callTool('get_property_status', { hotelId: hotel.id, ...(focus.date ? { date: focus.date } : {}) }, toolContext);
          const answer = writePropertyAnswer(status, focus, toolContext.today);
          const { inventory } = status;
          return {
            answer,
            factId: 'property_rooms',
            provenance: {
              title: 'Rooms for the night',
              displayValue: `${inventory.vacantAvailable} vacant and available`,
              formula: 'vacant & available = physical rooms − occupied − out of order − out of service',
              inputs: [
                { label: 'Night', value: status.date },
                { label: 'Physical rooms', value: String(inventory.physicalRooms) },
                { label: status.basis === 'results' ? 'Occupied (rooms sold)' : `Booked so far (as of ${status.asOf})`, value: String(inventory.occupied) },
                { label: 'Out of order', value: String(inventory.outOfOrder) },
                { label: 'Out of service', value: String(inventory.outOfService) },
                { label: 'Vacant and available', value: String(inventory.vacantAvailable) },
              ],
              sourceQuery:
                status.basis === 'results'
                  ? `daily_stats (rooms sold on ${status.date}) + room_status_events covering ${status.date}`
                  : `on_the_books (snapshot ${status.asOf}, stay ${status.date}) + room_status_events covering ${status.date}`,
              contextLabel: 'Rooms for the night',
            },
          };
        },
        plannedBy: planResult.plannedBy,
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
    const followupQuestions = withWhatIfFollowUp(narrativeWriter.suggestFollowups(plan.intent, analysis), plan.intent, analysis);
    const trailStages = withFinancialSnapshotLink(buildInsightTrail(plan.intent, analysis, followupQuestions), analysis, toolContext.today);
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
    // The what-if, decisions and the property have their own answers.
    simulate_scenario: undefined,
    get_decisions: undefined,
    get_property_status: undefined,
    get_room_events: undefined,
  };
  return resultForTool[tool] !== undefined;
}
