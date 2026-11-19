import type { InvestigationContext, StreamEvent, StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import { planForInvestigation } from '../src/orchestrator/insight-plan';
import { runInsight } from '../src/orchestrator/run-insight';
import { callTool } from '../src/tools/registry';

const TODAY = '2026-11-17';
const CONGRESS_NIGHT = { from: '2026-11-11', to: '2026-11-11' };

async function investigate(investigation: InvestigationContext) {
  const events: StreamEvent[] = [];
  await runInsight({
    question: 'A question in words',
    hotelId: 'sablon-bru',
    investigation,
    toolContext: createDemoToolContext(),
    emit: async (event) => {
      events.push({ ...event, runId: 'test', sequence: events.length } as StreamEvent);
    },
    signal: new AbortController().signal,
    pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
  });
  const find = <Type extends StreamEvent['type']>(type: Type) => events.find((event): event is StreamEventOfType<Type> => event.type === type);
  return { events, find };
}

describe('a data question from a chart point or a KPI', () => {
  it('queries the selected night, split as asked, against last year', () => {
    const plan = planForInvestigation(
      { origin: 'chart', intent: 'data_question', metric: 'occupancy', breakdown: 'segment', dateRange: CONGRESS_NIGHT },
      TODAY,
    );
    expect(plan.steps[0]?.input).toMatchObject({ period: CONGRESS_NIGHT, groupBy: 'segment', compareWithLastYear: true });
    expect(plan.dataFocus).toEqual({ primaryMetric: 'occupancy', rankBy: 'change' });
  });

  it('keeps the segment or channel of the selection as a filter', () => {
    const plan = planForInvestigation({ origin: 'kpi', intent: 'data_question', metric: 'net_revpar', channel: 'ota', breakdown: 'none' }, TODAY);
    expect(plan.steps[0]?.input).toMatchObject({ channels: ['ota'], groupBy: 'none' });
    expect(plan.dataFocus?.primaryMetric).toBe('net_revpar');
  });

  it('falls back to month to date for future nights or a range the tool refuses', () => {
    const monthToDate = { from: '2026-11-01', to: TODAY };
    const future = planForInvestigation({ origin: 'chart', intent: 'data_question', dateRange: { from: '2026-11-24', to: '2026-11-24' } }, TODAY);
    const tooLong = planForInvestigation({ origin: 'chart', intent: 'data_question', dateRange: { from: '2024-01-01', to: TODAY } }, TODAY);
    expect(future.steps[0]?.input).toMatchObject({ period: monthToDate });
    expect(tooLong.steps[0]?.input).toMatchObject({ period: monthToDate });
  });

  it('explains the congress night by the segment that lost it, even though MICE sold nothing', async () => {
    const { find } = await investigate({
      origin: 'chart',
      intent: 'data_question',
      interaction: 'explain',
      metric: 'occupancy',
      breakdown: 'segment',
      date: '2026-11-11',
      dateRange: CONGRESS_NIGHT,
    });
    expect(find('insight')?.headline).toMatch(/^MICE moved most: occupancy 0\.0%/);
    expect(find('done')).toMatchObject({ toolsChosenBy: 'context', context: { intent: 'data_question', period: CONGRESS_NIGHT } });
  });
});

describe('query_performance', () => {
  it('keeps a segment that sold nothing this year but did last year, as a row of zeros', async () => {
    const output = await callTool(
      'query_performance',
      { hotelId: 'sablon-bru', period: CONGRESS_NIGHT, groupBy: 'segment', compareWithLastYear: true },
      createDemoToolContext(),
    );
    const mice = output.rows.find((row) => row.key === 'mice');
    expect(mice).toMatchObject({ label: 'MICE', roomsSold: 0, occupancy: 0 });
    expect(mice?.lastYear?.roomsSold).toBeGreaterThan(0);
  });
});

describe('a single stay date from the pace chart', () => {
  it('looks at that night only, and the trail does not call it "the weakest night"', async () => {
    const { find } = await investigate({ origin: 'chart', intent: 'booking_pace', date: '2026-11-24', dateRange: { from: '2026-11-24', to: '2026-11-24' } });
    expect(find('run_started')?.investigation?.date).toBe('2026-11-24');
    expect(find('trail')?.stages[0]?.text).toBe('49 room nights are booked for 24 November, 21% behind last year.');
    expect(JSON.stringify(find('trail'))).not.toContain('weakest night');
  });
});
