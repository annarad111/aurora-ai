import type { StreamEvent, StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import { runInsight } from '../src/orchestrator/run-insight';

async function trailFor(question: string) {
  const events: StreamEvent[] = [];
  await runInsight({
    question,
    hotelId: 'sablon-bru',
    toolContext: createDemoToolContext(),
    emit: async (event) => {
      events.push({ ...event, runId: 'test', sequence: events.length } as StreamEvent);
    },
    signal: new AbortController().signal,
    pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
  });
  const trail = events.find((event): event is StreamEventOfType<'trail'> => event.type === 'trail');
  const textIndex = events.findIndex((event) => event.type === 'text_delta');
  return { trail, sentBeforeText: events.indexOf(trail!) < textIndex };
}

describe('the insight trail', () => {
  it('explains the revenue gap in four plain steps, ending with a way to act', async () => {
    const { trail, sentBeforeText } = await trailFor('Why is my hotel revenue below target this month?');
    expect(sentBeforeText).toBe(true);
    expect(trail?.stages.map((stage) => stage.stage)).toEqual(['observation', 'discovery', 'understanding', 'decision']);
    expect(trail?.stages.map((stage) => stage.text)).toEqual([
      'Room revenue is €33.9k below target for 1–17 Nov 2026.',
      '204 room nights were lost when the EU Health Congress on 10–12 November was cancelled.',
      'Fewer nights cost more than the higher rates brought in.',
      'Bookings for 21–30 November are 16% behind last year: there is still time to win nights back.',
    ]);
    expect(trail?.stages[3]?.action).toEqual({ kind: 'explore', label: 'Open the what-if simulator', view: 'pace' });
  });

  it('never shows a tool name', async () => {
    for (const question of ['What are OTA commissions costing us this month?', 'Are we on pace for the last 10 days of November?', 'Show ADR by channel vs last year']) {
      const { trail } = await trailFor(question);
      expect(trail?.stages.length).toBeGreaterThan(1);
      expect(JSON.stringify(trail)).not.toMatch(/get_|query_performance|analyze_/);
    }
  });

  it('a greeting has no trail', async () => {
    expect((await trailFor('hello')).trail).toBeUndefined();
  });
});
