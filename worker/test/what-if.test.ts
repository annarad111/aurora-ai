import type { StreamEvent, StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import type { LanguageModel } from '../src/llm/language-model';
import { LanguageModelInsightPlanner } from '../src/orchestrator/insight-planners';
import { runInsight } from '../src/orchestrator/run-insight';
import { parseWhatIfQuestion } from '../src/orchestrator/what-if-answer';

const TODAY = '2026-11-17';

async function ask(question: string, planner?: LanguageModelInsightPlanner) {
  const events: StreamEvent[] = [];
  await runInsight({
    question,
    hotelId: 'sablon-bru',
    toolContext: createDemoToolContext(),
    ...(planner ? { planner } : {}),
    emit: async (event) => {
      events.push({ ...event, runId: 'test', sequence: events.length } as StreamEvent);
    },
    signal: new AbortController().signal,
    pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
  });
  const find = <Type extends StreamEvent['type']>(type: Type) => events.find((event): event is StreamEventOfType<Type> => event.type === type);
  return { find, text: events.flatMap((event) => (event.type === 'text_delta' ? [event.text] : [])).join('') };
}

describe('recognising a what-if question', () => {
  it('reads the levers from the words', () => {
    expect(parseWhatIfQuestion('What if we win back half the gap?', TODAY)?.levers).toEqual({ paceRecovery: 0.5, rateChange: 0, otaToDirect: 0 });
    expect(parseWhatIfQuestion('What if we raise the rate by 5%?', TODAY)?.levers).toEqual({ paceRecovery: 0, rateChange: 0.05, otaToDirect: 0 });
    expect(parseWhatIfQuestion('what if we lower prices by 10%', TODAY)?.levers.rateChange).toBe(-0.1);
    expect(parseWhatIfQuestion('What if 20% of OTA bookings came direct?', TODAY)?.levers).toEqual({ paceRecovery: 0, rateChange: 0, otaToDirect: 0.2 });
    expect(parseWhatIfQuestion('What if we win back 30% and raise prices by 10%?', TODAY)?.levers).toEqual({ paceRecovery: 0.3, rateChange: 0.1, otaToDirect: 0 });
  });

  it('uses "win back half the gap" as an example when no lever is named', () => {
    expect(parseWhatIfQuestion('Run a what-if simulation', TODAY)).toMatchObject({ isExample: true, levers: { paceRecovery: 0.5 } });
  });

  it('leaves other questions alone', () => {
    expect(parseWhatIfQuestion('Are we on pace for 21–30 Nov 2026?', TODAY)).toBeNull();
    expect(parseWhatIfQuestion('Why is revenue below target this month?', TODAY)).toBeNull();
  });
});

describe('asking Aurora a what-if', () => {
  it('answers from simulate_scenario, shows the pace chart and opens the simulator', async () => {
    const { find, text } = await ask('What if we win back half the gap?');
    expect(find('step')).toMatchObject({ tool: 'simulate_scenario' });
    expect(find('insight')?.headline).toBe('Winning back half of the gap would be worth +€9,002 in net revenue for 21–30 November.');
    expect(text).toContain('The hotel would sell 60 more room nights at €168');
    expect(text).toContain('not a forecast');
    expect(find('chart')?.chart.kind).toBe('booking_pace');
    expect(find('trail')?.stages.at(-1)?.action).toEqual({ kind: 'explore', label: 'Open the what-if simulator', view: 'pace' });
  });

  it('says a rate change alone changes nothing, and what it would do with half the gap won back', async () => {
    const { find, text } = await ask('What if we raise the rate by 5%?');
    expect(find('insight')?.headline).toBe('A 5% rate change alone does not change net revenue for 21–30 November.');
    expect(text).toContain('Together with winning back half the gap, it would be worth +€9,452');
  });

  it('saves commission when booking-site guests book direct', async () => {
    expect((await ask('What if 20% of OTA bookings came direct?')).find('insight')?.headline).toBe(
      'Moving 20% of booking-site revenue to direct would be worth +€1,766 in net revenue for 21–30 November.',
    );
  });

  it('follows the model when it chooses simulate_scenario', async () => {
    const model: LanguageModel = {
      modelId: 'test-model',
      complete: async () => ({ text: '', toolNames: ['simulate_scenario'], toolCalls: [{ name: 'simulate_scenario', arguments: { otaToDirect: 0.2 } }] }),
    };
    const { find } = await ask('how much would direct bookings save us?', new LanguageModelInsightPlanner(model));
    expect(find('insight')?.headline).toContain('Moving 20% of booking-site revenue to direct');
    expect(find('done')?.toolsChosenBy).toBe('llm');
  });

  it('offers a what-if after an answer about pace', async () => {
    const { find } = await ask('Are we on pace for 21–30 Nov 2026?');
    expect(find('followups')?.questions).toContain('What if we win back half the gap for 21–30 November?');
  });
});
