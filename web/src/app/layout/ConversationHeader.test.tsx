import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialRunState, type RunState } from '../../stream/run-reducer';
import { ConversationHeader, periodOfAnswer } from './ConversationHeader';

const done = (overrides: Partial<RunState>): RunState => ({ ...initialRunState, phase: 'done', ...overrides });

describe('the conversation header', () => {
  it('shows the nights the latest answer is about, not a fixed month to date', () => {
    const october = { from: '2026-10-01', to: '2026-10-31' };
    expect(periodOfAnswer(done({ completion: { durationMs: 1, provider: 'scripted', verifiedFigureCount: 0, answerKind: 'analysis', context: { intent: 'data_question', period: october } } }))).toEqual(october);
    expect(periodOfAnswer(done({ completion: { durationMs: 1, provider: 'scripted', verifiedFigureCount: 0, answerKind: 'conversation' } }))).toBeNull();
    expect(periodOfAnswer({ ...initialRunState, phase: 'streaming' })).toBeNull();
  });

  it('labels the demo date, and shows a status only while Aurora works', () => {
    const idle = renderToStaticMarkup(<ConversationHeader title="Pace" runPhase="done" answerPeriod={{ from: '2026-11-21', to: '2026-11-30' }} today="2026-11-17" />);
    expect(idle).toContain('21–30 Nov 2026');
    expect(idle).toContain('Demo data · today is 17 Nov 2026');
    expect(idle).not.toContain('verified');
    expect(idle).not.toContain('analysing');

    const working = renderToStaticMarkup(<ConversationHeader title="Pace" runPhase="streaming" answerPeriod={null} today="2026-11-17" />);
    expect(working).toContain('Aurora is analysing…');
  });
});
