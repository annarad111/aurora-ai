import type { AnsweredContext, InvestigationContext } from '@aurora/shared';
import type { ChartKind, ChartPayload, StepStatus, StreamEvent, StreamEventOfType, TrailStage } from '@aurora/shared';

// ---------------------------------------------------------------------------
// The state of one answer, built only from stream events and user actions.
//
// This is a pure function (state + action -> new state), so it is easy to
// test and the same events always give the same screen. No Redux or Zustand
// needed for a single flow.
// ---------------------------------------------------------------------------

/**
 *   idle       nothing asked yet
 *   streaming  events are arriving
 *   done       the answer is complete
 *   cancelled  the user pressed Stop; what arrived is kept
 *   error      the server reported an error or the connection dropped; what arrived is kept
 */
export type RunPhase = 'idle' | 'streaming' | 'done' | 'cancelled' | 'error';

export interface RunStep {
  stepId: string;
  label: string;
  tool: string;
  /** "stopped" is added by the client when the user presses Stop. */
  status: StepStatus | 'stopped';
}

/** One piece of the explanation: plain text, or a figure linked to a fact. */
export interface ExplanationSegment {
  text: string;
  factId?: string;
}

export type KpiCardData = StreamEventOfType<'kpi'>;
export type InsightData = StreamEventOfType<'insight'>;
export type ProvenanceData = StreamEventOfType<'provenance'>;

export interface RunCompletion {
  durationMs: number;
  provider: 'llm' | 'scripted';
  verifiedFigureCount: number;
  toolsChosenBy?: 'llm' | 'keywords' | 'context';
  /** Why the templates wrote the text although the model was asked. */
  fallbackReason?: string;
  /** The earlier question this one was read as a follow-up to. */
  followUpOf?: string;
  /** "conversation" for a reply in words only (a greeting, thanks, a message outside the hotel's business). */
  answerKind: 'analysis' | 'conversation';
  /** What the answer covered (analysis, nights, query), for saving it as an insight. */
  context?: AnsweredContext;
}

export interface RunError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface RunState {
  phase: RunPhase;
  question: string;
  /** What the question investigates, when it was opened from the briefing instead of typed. */
  investigation: InvestigationContext | null;
  /** The hotel the answer is about, from run_started (the what-if simulator needs it). */
  hotelId: string | null;
  /** Set by run_started. Events from any other run are ignored. */
  runId: string | null;
  lastSequence: number;
  steps: RunStep[];
  kpis: KpiCardData[];
  insight: InsightData | null;
  explanation: ExplanationSegment[];
  charts: Partial<Record<ChartKind, ChartPayload>>;
  provenanceByFactId: Record<string, ProvenanceData>;
  followups: string[];
  /** The reasoning in four plain steps; null until the tools are done (and for replies in words). */
  trail: TrailStage[] | null;
  completion: RunCompletion | null;
  error: RunError | null;
}

export type RunAction =
  | { type: 'run_requested'; question: string; investigation?: InvestigationContext }
  | { type: 'event_received'; event: StreamEvent }
  | { type: 'run_cancelled' }
  | { type: 'connection_failed'; message: string }
  | { type: 'reset' };

export const initialRunState: RunState = {
  phase: 'idle',
  question: '',
  investigation: null,
  hotelId: null,
  runId: null,
  lastSequence: -1,
  steps: [],
  kpis: [],
  insight: null,
  explanation: [],
  charts: {},
  provenanceByFactId: {},
  followups: [],
  trail: null,
  completion: null,
  error: null,
};

/** Steps that never finished become "stopped" when the run ends early. */
function stopUnfinishedSteps(steps: RunStep[]): RunStep[] {
  return steps.map((step) => (step.status === 'pending' || step.status === 'running' ? { ...step, status: 'stopped' } : step));
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'run_requested':
      return { ...initialRunState, phase: 'streaming', question: action.question, investigation: action.investigation ?? null };

    case 'run_cancelled':
      if (state.phase !== 'streaming') return state;
      return { ...state, phase: 'cancelled', steps: stopUnfinishedSteps(state.steps) };

    case 'connection_failed':
      if (state.phase !== 'streaming') return state;
      return {
        ...state,
        phase: 'error',
        steps: stopUnfinishedSteps(state.steps),
        error: { code: 'connection_failed', message: action.message, recoverable: true },
      };

    case 'reset':
      return initialRunState;

    case 'event_received':
      return applyStreamEvent(state, action.event);
  }
}

function applyStreamEvent(state: RunState, event: StreamEvent): RunState {
  // Only a streaming run accepts events (after Stop, late events are dropped).
  if (state.phase !== 'streaming') return state;

  if (event.type === 'run_started') {
    if (state.runId !== null) return state;
    return { ...state, runId: event.runId, lastSequence: event.sequence, hotelId: event.hotelId, investigation: event.investigation ?? state.investigation };
  }
  // Ignore events from another run, and duplicates or out-of-order repeats.
  if (event.runId !== state.runId || event.sequence <= state.lastSequence) return state;

  const nextState: RunState = { ...state, lastSequence: event.sequence };

  switch (event.type) {
    case 'step': {
      const updatedStep: RunStep = { stepId: event.stepId, label: event.label, tool: event.tool, status: event.status };
      const stepExists = state.steps.some((step) => step.stepId === event.stepId);
      return {
        ...nextState,
        steps: stepExists ? state.steps.map((step) => (step.stepId === event.stepId ? updatedStep : step)) : [...state.steps, updatedStep],
      };
    }

    case 'kpi':
      return { ...nextState, kpis: [...state.kpis.filter((kpi) => kpi.factId !== event.factId), event] };

    case 'insight':
      return { ...nextState, insight: event };

    case 'text_delta':
      return { ...nextState, explanation: appendExplanationSegment(state.explanation, { text: event.text, factId: event.factId }) };

    case 'chart':
      return { ...nextState, charts: { ...state.charts, [event.chart.kind]: event.chart } };

    case 'provenance':
      return { ...nextState, provenanceByFactId: { ...state.provenanceByFactId, [event.factId]: event } };

    case 'followups':
      return { ...nextState, followups: event.questions };

    case 'trail':
      return { ...nextState, trail: event.stages };

    case 'done':
      return {
        ...nextState,
        phase: 'done',
        completion: {
          durationMs: event.durationMs,
          provider: event.provider,
          verifiedFigureCount: event.verifiedFigureCount,
          ...(event.toolsChosenBy ? { toolsChosenBy: event.toolsChosenBy } : {}),
          ...(event.fallbackReason ? { fallbackReason: event.fallbackReason } : {}),
          ...(event.followUpOf ? { followUpOf: event.followUpOf } : {}),
          ...(event.context ? { context: event.context } : {}),
          answerKind: event.answerKind,
        },
      };

    case 'error':
      return {
        ...nextState,
        phase: 'error',
        steps: stopUnfinishedSteps(state.steps),
        error: { code: event.code, message: event.message, recoverable: event.recoverable },
      };
  }
}

/**
 * Consecutive plain words are merged into one segment, so a 90-word answer
 * becomes ~20 segments instead of 90 DOM nodes. Figures always stay separate.
 */
function appendExplanationSegment(segments: ExplanationSegment[], incoming: ExplanationSegment): ExplanationSegment[] {
  const lastSegment = segments.at(-1);
  if (!incoming.factId && lastSegment && !lastSegment.factId) {
    return [...segments.slice(0, -1), { text: lastSegment.text + incoming.text }];
  }
  return [...segments, incoming.factId ? { text: incoming.text, factId: incoming.factId } : { text: incoming.text }];
}
