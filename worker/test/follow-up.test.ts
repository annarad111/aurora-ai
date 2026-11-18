import type { ConversationTurn, StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import { isFollowUpQuestion, planFollowUp } from '../src/orchestrator/follow-up';
import { runInsight } from '../src/orchestrator/run-insight';
import type { StreamEvent } from '@aurora/shared';

const TODAY = '2026-11-17';

const adrByChannelInOctober: ConversationTurn = {
  question: 'What was ADR by channel in October?',
  context: {
    intent: 'data_question',
    period: { from: '2026-10-01', to: '2026-10-31' },
    query: { period: { from: '2026-10-01', to: '2026-10-31' }, groupBy: 'channel', compareWithLastYear: false },
    primaryMetric: 'adr',
  },
};

const gapThisMonth: ConversationTurn = {
  question: 'Why is my hotel revenue below target this month?',
  context: { intent: 'revenue_gap', period: { from: '2026-11-01', to: '2026-11-17' } },
};

describe('which questions are follow-ups', () => {
  it.each(['and November?', 'What about weekends?', 'Only OTA', 'ADR by segment?', 'Same for last year'])('"%s" is a follow-up', (question) => {
    expect(isFollowUpQuestion(question)).toBe(true);
  });

  it('a full question of its own is not', () => {
    expect(isFollowUpQuestion('What was occupancy on 5 November?')).toBe(false);
  });
});

describe('a follow-up keeps what the previous answer covered', () => {
  it('"and November?" keeps ADR by channel and changes only the month', () => {
    const plan = planFollowUp('and November?', adrByChannelInOctober, TODAY);
    expect(plan?.intent).toBe('data_question');
    expect(plan?.steps[0]?.input).toMatchObject({ groupBy: 'channel', period: { from: '2026-11-01', to: '2026-11-17' } });
    expect(plan?.dataFocus?.primaryMetric).toBe('adr');
  });

  it('"what about weekends?" adds the weekend filter to the same query', () => {
    expect(planFollowUp('What about weekends?', adrByChannelInOctober, TODAY)?.steps[0]?.input).toMatchObject({
      groupBy: 'channel',
      dayType: 'weekend',
      period: { from: '2026-10-01', to: '2026-10-31' },
    });
  });

  it('"by segment, OTA only" changes the split and adds a channel filter', () => {
    expect(planFollowUp('and by segment, OTA only', adrByChannelInOctober, TODAY)?.steps[0]?.input).toMatchObject({ groupBy: 'segment', channels: ['ota'] });
  });

  it('"vs last year" turns the comparison on', () => {
    expect(planFollowUp('and vs last year?', adrByChannelInOctober, TODAY)?.steps[0]?.input).toMatchObject({ compareWithLastYear: true, groupBy: 'channel' });
  });

  it('after a gap analysis, "and October?" runs the same analysis for October', () => {
    const plan = planFollowUp('and October?', gapThisMonth, TODAY);
    expect(plan?.intent).toBe('revenue_gap');
    expect(plan?.periodOverride).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('after a gap analysis, "by segment?" shows the numbers for the same nights', () => {
    expect(planFollowUp('by segment?', gapThisMonth, TODAY)?.steps[0]?.input).toMatchObject({ groupBy: 'segment', period: { from: '2026-11-01', to: '2026-11-17' } });
  });

  it('"why?" after a question about October explains the gap for October', () => {
    const plan = planFollowUp('Why below target?', adrByChannelInOctober, TODAY);
    expect(plan?.intent).toBe('revenue_gap');
    expect(plan?.periodOverride).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('a new full question is planned fresh', () => {
    expect(planFollowUp('What was occupancy on 5 November?', adrByChannelInOctober, TODAY)).toBeNull();
  });

  it('without an earlier question nothing is a follow-up', () => {
    expect(planFollowUp('and November?', undefined, TODAY)).toBeNull();
  });
});

describe('a run with history', () => {
  async function runQuestion(question: string, history: ConversationTurn[]) {
    const events: StreamEvent[] = [];
    await runInsight({
      question,
      hotelId: 'sablon-bru',
      history,
      toolContext: createDemoToolContext(),
      emit: async (event) => {
        events.push({ ...event, runId: 'test', sequence: events.length } as StreamEvent);
      },
      signal: new AbortController().signal,
      pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
    });
    return events.find((event): event is StreamEventOfType<'done'> => event.type === 'done');
  }

  it('says which question it followed up on, and what this answer covered', async () => {
    const done = await runQuestion('What about weekends?', [adrByChannelInOctober]);
    expect(done?.followUpOf).toBe(adrByChannelInOctober.question);
    expect(done?.context).toMatchObject({ intent: 'data_question', query: { groupBy: 'channel', dayType: 'weekend' }, primaryMetric: 'adr' });
  });

  it('a first question reports its context too, with no follow-up', async () => {
    const done = await runQuestion('Why is my hotel revenue below target this month?', []);
    expect(done?.followUpOf).toBeUndefined();
    expect(done?.context).toEqual({ intent: 'revenue_gap', period: { from: '2026-11-01', to: '2026-11-17' } });
  });
});
