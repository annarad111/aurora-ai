import { streamEventSchema, type StreamEvent, type StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import { LanguageModelError, type LanguageModel, type LanguageModelRequest, type LanguageModelResponse } from '../src/llm/language-model';
import { readWorkersAiResult } from '../src/llm/workers-ai-model';
import { planFromToolNames } from '../src/orchestrator/insight-plan';
import { LanguageModelInsightPlanner } from '../src/orchestrator/insight-planners';
import { LanguageModelNarrativeWriter } from '../src/orchestrator/language-model-narrative-writer';
import { checkAndRenderNarrative } from '../src/orchestrator/narrative-guard';
import { runInsight } from '../src/orchestrator/run-insight';

/** A model that answers from a script: each call takes the next answer (or throws it). */
class ScriptedFakeModel implements LanguageModel {
  readonly modelId = 'fake-model';
  readonly requests: LanguageModelRequest[] = [];
  constructor(private readonly answers: Array<LanguageModelResponse | Error>) {}

  async complete(request: LanguageModelRequest): Promise<LanguageModelResponse> {
    this.requests.push(request);
    const answer = this.answers.shift();
    if (!answer) throw new LanguageModelError('No more scripted answers');
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

const GOOD_EXPLANATION =
  'Revenue is {revenue_gap} below target for {period}. Most of it is volume: you sold {room_nights_difference} than planned, ' +
  'and MICE alone is {biggest_segment_shortfall} short because the block on {block_nights} was cancelled. ' +
  'ADR is {adr_vs_target}, but OTA share rose to {ota_share}, so Net RevPAR is down {net_revpar_change}. ' +
  'Pace for {pace_window} is {pace_vs_last_year}.';

const ALL_TOOLS: LanguageModelResponse = {
  text: '',
  toolNames: ['get_booking_pace', 'get_hotel_overview', 'analyze_revenue_drivers', 'get_channel_mix'],
};

async function runWithModel(model: LanguageModel, question = 'Why is my hotel revenue below target this month?') {
  const events: StreamEvent[] = [];
  await runInsight({
    question,
    hotelId: 'sablon-bru',
    toolContext: createDemoToolContext(),
    signal: new AbortController().signal,
    pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
    planner: new LanguageModelInsightPlanner(model),
    narrativeWriter: new LanguageModelNarrativeWriter(model),
    emit: async (payload) => {
      events.push(streamEventSchema.parse({ ...payload, runId: 'run_test', sequence: events.length }));
    },
  });
  const explanation = events.flatMap((event) => (event.type === 'text_delta' ? [event.text] : [])).join('');
  const done = events.find((event): event is StreamEventOfType<'done'> => event.type === 'done');
  return { events, explanation, done };
}

describe('the number guard', () => {
  const catalogue = [
    { key: 'revenue_gap', factId: 'revenue_gap', text: '€33,917', meaning: 'gap' },
    { key: 'volume_effect', factId: 'volume', text: '€41,932', meaning: 'volume' },
    { key: 'mix_effect', factId: 'mix', text: '€6,240', meaning: 'mix' },
    { key: 'period', text: '1–17 November', meaning: 'period' },
  ];
  const validText = 'Revenue is {revenue_gap} below target for {period}. Volume explains {volume_effect} of it, and the segment mix took away another {mix_effect}, because more guests came from cheaper segments than planned this month.';

  it('fills the placeholders with the exact values and keeps figures clickable', () => {
    const result = checkAndRenderNarrative(validText, catalogue);
    expect(result.isValid).toBe(true);
    expect(result.segments.slice(0, 4)).toEqual([
      { text: 'Revenue is ' },
      { text: '€33,917', factId: 'revenue_gap' },
      { text: ' below target for 1–17 November. Volume explains ' },
      { text: '€41,932', factId: 'volume' },
    ]);
  });

  it('rejects a number the model typed itself', () => {
    const result = checkAndRenderNarrative(validText.replace('{volume_effect}', '€42k'), catalogue);
    expect(result.isValid).toBe(false);
    expect(result.problems.join(' ')).toMatch(/Numbers must only appear through placeholders.*€42k/);
  });

  it('rejects placeholders that do not exist', () => {
    const result = checkAndRenderNarrative(`${validText} Pace is {pace_magic}.`, catalogue);
    expect(result.problems.join(' ')).toMatch(/\{pace_magic\}/);
  });

  it('rejects an answer that uses fewer than three figures', () => {
    const result = checkAndRenderNarrative('Revenue is {revenue_gap} below target, mainly because of lower volume and a weaker mix of guests than the plan expected for the month.', catalogue);
    expect(result.problems.join(' ')).toMatch(/at least 3 figure placeholders/);
  });

  it('removes Markdown the explanation area cannot show', () => {
    const result = checkAndRenderNarrative(`**${validText}**`, catalogue);
    expect(result.isValid).toBe(true);
    expect(result.segments[0]).toEqual({ text: 'Revenue is ' });
  });
});

describe('reading Workers AI responses', () => {
  it('accepts both tool-call shapes', () => {
    expect(readWorkersAiResult({ response: '', tool_calls: [{ name: 'get_channel_mix' }, { function: { name: 'get_booking_pace' } }] }).toolNames).toEqual([
      'get_channel_mix',
      'get_booking_pace',
    ]);
  });

  it('refuses an empty response', () => {
    expect(() => readWorkersAiResult(null)).toThrow(LanguageModelError);
    expect(() => readWorkersAiResult({ response: '' })).toThrow(/neither text nor tool calls/);
  });

  it('reads the OpenAI format the same model sometimes uses', () => {
    const result = readWorkersAiResult({ object: 'chat.completion', choices: [{ message: { role: 'assistant', content: 'Revenue is {revenue_gap} below target.' } }] });
    expect(result.text).toBe('Revenue is {revenue_gap} below target.');
  });

  // The exact shape Llama 3.3 returned on Workers AI during testing.
  it('accepts tool calls the model wrote as JSON text, but only for offered tools', () => {
    const content =
      '["{\\"type\\": \\"function\\", \\"name\\": \\"get_hotel_overview\\", \\"parameters\\": {}}", ' +
      '"{\\"type\\": \\"function\\", \\"name\\": \\"analyze_revenue_drivers\\", \\"parameters\\": {}}", ' +
      '"{\\"type\\": \\"function\\", \\"name\\": \\"delete_everything\\", \\"parameters\\": {}}"]';
    const result = readWorkersAiResult(
      { object: 'chat.completion', choices: [{ message: { content } }] },
      ['get_hotel_overview', 'analyze_revenue_drivers', 'get_channel_mix', 'get_booking_pace'],
    );
    expect(result.toolNames).toEqual(['get_hotel_overview', 'analyze_revenue_drivers']);
  });

  it('never treats prose as a tool call', () => {
    const result = readWorkersAiResult({ response: 'I would look at get_channel_mix first.' }, ['get_channel_mix']);
    expect(result.toolNames).toEqual([]);
  });
});

describe('planning from the tools the model chose', () => {
  it('derives the intent and adds the tools that intent needs', () => {
    expect(planFromToolNames(['get_channel_mix'])).toMatchObject({ intent: 'channel_cost' });
    expect(planFromToolNames(['get_channel_mix']).steps.map((step) => step.tool)).toEqual(['get_hotel_overview', 'get_channel_mix']);
    expect(planFromToolNames(['get_booking_pace', 'get_channel_mix']).intent).toBe('revenue_gap');
    expect(planFromToolNames(['get_booking_pace', 'get_channel_mix']).steps.map((step) => step.tool)).toEqual([
      'get_hotel_overview',
      'analyze_revenue_drivers',
      'get_channel_mix',
      'get_booking_pace',
    ]);
  });
});

describe('a run with the language model', () => {
  it('uses the tools the model chose and the explanation it wrote, with exact numbers', async () => {
    const model = new ScriptedFakeModel([ALL_TOOLS, { text: GOOD_EXPLANATION, toolNames: [] }]);
    const { explanation, done, events } = await runWithModel(model);

    expect(done).toMatchObject({ provider: 'llm', toolsChosenBy: 'llm' });
    expect(done?.fallbackReason).toBeUndefined();
    expect(explanation).toBe(
      'Revenue is €33,917 below target for 1–17 November. Most of it is volume: you sold 245 fewer room nights than planned, ' +
        'and MICE alone is 204 room nights short because the block on 10–12 November was cancelled. ' +
        'ADR is 4.0% above target, but OTA share rose to 48%, so Net RevPAR is down 16.0%. ' +
        'Pace for 21–30 November is 16% behind last year.',
    );
    // The tools ran in the fixed order, not in the order the model listed them.
    expect([...new Set(events.flatMap((event) => (event.type === 'step' ? [event.tool] : [])))]).toEqual([
      'get_hotel_overview',
      'analyze_revenue_drivers',
      'get_channel_mix',
      'get_booking_pace',
    ]);
    expect(done?.verifiedFigureCount).toBe(7);
  });

  it('gives the model the tool list for planning, and the figure catalogue for writing', async () => {
    const model = new ScriptedFakeModel([ALL_TOOLS, { text: GOOD_EXPLANATION, toolNames: [] }]);
    await runWithModel(model);
    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toHaveLength(4);
    expect(model.requests[1]?.user).toContain('{revenue_gap} = "€33,917"');
    expect(model.requests[1]?.system).toContain('Never write a digit');
  });

  it('retries once with the problems, and accepts the corrected answer', async () => {
    const model = new ScriptedFakeModel([
      ALL_TOOLS,
      { text: GOOD_EXPLANATION.replace('{ota_share}', '48 percent'), toolNames: [] },
      { text: GOOD_EXPLANATION, toolNames: [] },
    ]);
    const { done } = await runWithModel(model);
    expect(done?.provider).toBe('llm');
    expect(model.requests[2]?.user).toContain('Your previous answer was rejected');
    expect(model.requests[2]?.user).toContain('48');
  });

  it('falls back to the templates when the model breaks the rules twice', async () => {
    const answerWithNumbers: LanguageModelResponse = { text: 'Revenue is 34k below target because of 245 fewer nights and many other numbers like 16%.', toolNames: [] };
    const model = new ScriptedFakeModel([ALL_TOOLS, answerWithNumbers, answerWithNumbers]);
    const { done, explanation } = await runWithModel(model);
    expect(done).toMatchObject({ provider: 'scripted', fallbackReason: 'The model answer did not pass the number guard' });
    expect(explanation).toMatch(/^Revenue is €33,917 below target for 1–17 November\. Most of the gap is volume/);
  });

  it('falls back to keyword planning and templates when the model is unavailable', async () => {
    const model = new ScriptedFakeModel([new LanguageModelError('Quota exceeded'), new LanguageModelError('Quota exceeded')]);
    const { done, explanation } = await runWithModel(model);
    expect(done).toMatchObject({ provider: 'scripted', toolsChosenBy: 'keywords', fallbackReason: 'Quota exceeded' });
    expect(explanation.length).toBeGreaterThan(100);
  });

  it('answers a channel question with the channel templates when the model picks only that tool', async () => {
    const model = new ScriptedFakeModel([{ text: '', toolNames: ['get_channel_mix'] }, new LanguageModelError('Timeout')]);
    const { done, explanation } = await runWithModel(model, 'What are OTA commissions costing us this month?');
    expect(done?.toolsChosenBy).toBe('llm');
    expect(explanation).toMatch(/^OTA share of room revenue is 48%/);
  });
});
