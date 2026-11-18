import type { StreamEvent } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { initialRunState, runReducer, type RunAction, type RunState } from './run-reducer';

const RUN_ID = 'run_1';
let nextSequence = 0;

/** Builds an event of the test run with the next sequence number. */
function streamEvent(payload: Record<string, unknown>): RunAction {
  const event = { runId: RUN_ID, sequence: nextSequence, ...payload } as StreamEvent;
  nextSequence += 1;
  return { type: 'event_received', event };
}

function applyActions(actions: RunAction[], startState: RunState = initialRunState): RunState {
  return actions.reduce(runReducer, startState);
}

function startedRun(): RunState {
  nextSequence = 0;
  return applyActions([
    { type: 'run_requested', question: 'Why?' },
    streamEvent({ type: 'run_started', question: 'Why?', hotelId: 'sablon-bru' }),
    streamEvent({ type: 'step', stepId: 'overview', label: 'Checking occupancy and rate', tool: 'get_hotel_overview', status: 'pending' }),
    streamEvent({ type: 'step', stepId: 'drivers', label: 'Decomposing the revenue gap', tool: 'analyze_revenue_drivers', status: 'pending' }),
    streamEvent({ type: 'step', stepId: 'overview', label: 'Checking occupancy and rate', tool: 'get_hotel_overview', status: 'running' }),
  ]);
}

describe('runReducer', () => {
  it('starts streaming with an empty answer when a question is asked', () => {
    const state = runReducer(initialRunState, { type: 'run_requested', question: 'Why?' });
    expect(state.phase).toBe('streaming');
    expect(state.question).toBe('Why?');
    expect(state.steps).toEqual([]);
  });

  it('adds steps once and then updates their status', () => {
    const state = startedRun();
    expect(state.steps.map((step) => `${step.stepId}:${step.status}`)).toEqual(['overview:running', 'drivers:pending']);
  });

  it('merges consecutive words but keeps figures separate', () => {
    const state = applyActions(
      [
        streamEvent({ type: 'text_delta', text: 'Revenue ' }),
        streamEvent({ type: 'text_delta', text: 'is ' }),
        streamEvent({ type: 'text_delta', text: '€33,917', factId: 'revenue_gap' }),
        streamEvent({ type: 'text_delta', text: ' below ' }),
        streamEvent({ type: 'text_delta', text: 'target.' }),
      ],
      startedRun(),
    );
    expect(state.explanation).toEqual([{ text: 'Revenue is ' }, { text: '€33,917', factId: 'revenue_gap' }, { text: ' below target.' }]);
  });

  it('marks unfinished steps as stopped on Stop, and keeps what arrived', () => {
    const withText = applyActions([streamEvent({ type: 'text_delta', text: 'Revenue ' })], startedRun());
    const cancelled = runReducer(withText, { type: 'run_cancelled' });
    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.steps.map((step) => step.status)).toEqual(['stopped', 'stopped']);
    expect(cancelled.explanation).toEqual([{ text: 'Revenue ' }]);
  });

  it('ignores events that arrive after Stop', () => {
    const cancelled = runReducer(startedRun(), { type: 'run_cancelled' });
    const afterLateEvent = applyActions([streamEvent({ type: 'text_delta', text: 'late' })], cancelled);
    expect(afterLateEvent.explanation).toEqual([]);
  });

  it('ignores events from another run and repeated sequence numbers', () => {
    const state = startedRun();
    const otherRun = runReducer(state, {
      type: 'event_received',
      event: { type: 'text_delta', runId: 'run_other', sequence: 99, text: 'nope' },
    });
    expect(otherRun.explanation).toEqual([]);
    const repeated = runReducer(state, { type: 'event_received', event: { type: 'text_delta', runId: RUN_ID, sequence: 1, text: 'old' } });
    expect(repeated.explanation).toEqual([]);
  });

  it('finishes with done', () => {
    const state = applyActions([streamEvent({ type: 'done', durationMs: 4100, provider: 'scripted', verifiedFigureCount: 10 })], startedRun());
    expect(state.phase).toBe('done');
    expect(state.completion).toEqual({ durationMs: 4100, provider: 'scripted', verifiedFigureCount: 10 });
  });

  it('keeps the partial answer on a server error', () => {
    const state = applyActions(
      [
        streamEvent({ type: 'text_delta', text: 'Revenue ' }),
        streamEvent({ type: 'error', code: 'internal_error', message: 'Try again', recoverable: true }),
      ],
      startedRun(),
    );
    expect(state.phase).toBe('error');
    expect(state.error?.recoverable).toBe(true);
    expect(state.explanation).toEqual([{ text: 'Revenue ' }]);
  });

  it('turns a dropped connection into a recoverable error', () => {
    const state = runReducer(startedRun(), { type: 'connection_failed', message: 'Network down' });
    expect(state.phase).toBe('error');
    expect(state.error).toEqual({ code: 'connection_failed', message: 'Network down', recoverable: true });
  });
});
