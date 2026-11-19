import type { NewSavedInsight, StreamEvent, StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createAction, saveInsight } from '../src/decisions/decision-service';
import { createDemoToolContext } from '../src/demo-context';
import { parseDecisionsQuestion } from '../src/orchestrator/decisions-answer';
import { KeywordInsightPlanner, LanguageModelInsightPlanner } from '../src/orchestrator/insight-planners';
import { runInsight } from '../src/orchestrator/run-insight';
import type { LanguageModel } from '../src/llm/language-model';
import { callTool } from '../src/tools/registry';
import type { ToolContext } from '../src/tools/tool-context';

const TODAY = '2026-11-17';

const paceInsight: NewSavedInsight = {
  hotelId: 'sablon-bru',
  sourceKey: 'briefing:pace:2026-11-21:2026-11-30',
  origin: 'briefing',
  title: 'Bookings for 21–30 November are 16% behind last year',
  description: '',
  metric: 'booking_pace',
  measure: { label: 'Room nights on the books', unit: 'count', value: 612, baseline: 731, baselineLabel: 'last year at this point' },
  period: { from: '2026-11-21', to: '2026-11-30' },
  evidence: [],
  sourceConversationId: null,
  investigation: { question: 'Are we on pace for 21–30 Nov 2026?', context: null },
};

/** A hotel with one saved insight and three actions: one overdue high, one medium, one completed. */
async function contextWithDecisions(): Promise<ToolContext> {
  const context = createDemoToolContext();
  const { insight } = await saveInsight(context, paceInsight, `${TODAY}T08:00:00Z`);
  const base = { hotelId: 'sablon-bru', insightId: insight.id, description: '', notes: '', startedFromSuggestion: true } as const;
  await createAction(context, { ...base, title: 'Launch a direct-booking offer', priority: 'medium', status: 'todo', owner: null, dueDate: '2026-11-25' }, `${TODAY}T08:01:00Z`);
  await createAction(context, { ...base, title: 'Call the congress organiser', priority: 'high', status: 'in_progress', owner: 'Sales manager', dueDate: '2026-11-15' }, `${TODAY}T08:02:00Z`);
  await createAction(context, { ...base, title: 'Review OTA rates', priority: 'low', status: 'completed', owner: null, dueDate: null }, `${TODAY}T08:03:00Z`);
  return context;
}

async function ask(question: string, context: ToolContext, planner = new KeywordInsightPlanner()) {
  const events: StreamEvent[] = [];
  await runInsight({
    question,
    hotelId: 'sablon-bru',
    toolContext: context,
    planner,
    emit: async (event) => {
      events.push({ ...event, runId: 'test', sequence: events.length } as StreamEvent);
    },
    signal: new AbortController().signal,
    pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
  });
  const find = <Type extends StreamEvent['type']>(type: Type) => events.find((event): event is StreamEventOfType<Type> => event.type === type);
  const text = events.flatMap((event) => (event.type === 'text_delta' ? [event.text] : [])).join('');
  return { events, find, text };
}

describe('recognising a question about the saved decisions', () => {
  it('reads the list, and what part of it is asked for', () => {
    expect(parseDecisionsQuestion('what decisions are saved?')).toEqual({});
    expect(parseDecisionsQuestion('Which actions are high priority?')).toEqual({ priorities: ['high'] });
    expect(parseDecisionsQuestion('what is overdue?')).toEqual({ due: 'overdue' });
    expect(parseDecisionsQuestion('show my open actions')).toEqual({ statuses: ['todo', 'in_progress'] });
    expect(parseDecisionsQuestion('what was marked priority first?')).toEqual({});
    expect(parseDecisionsQuestion('Which actions are completed?')).toEqual({ statuses: ['completed'] });
  });

  it('leaves analysis questions and requests for advice alone', () => {
    expect(parseDecisionsQuestion('Why is revenue below target this month?')).toBeNull();
    expect(parseDecisionsQuestion('What decisions should we take about pace?')).toBeNull();
    expect(parseDecisionsQuestion('Are we on pace for 21–30 Nov 2026?')).toBeNull();
  });
});

describe('get_decisions', () => {
  it('lists open actions first, high priority first, and marks what is overdue', async () => {
    const output = await callTool('get_decisions', { hotelId: 'sablon-bru' }, await contextWithDecisions());
    expect(output.actions.map((action) => [action.title, action.isOverdue])).toEqual([
      ['Call the congress organiser', true],
      ['Launch a direct-booking offer', false],
      ['Review OTA rates', false],
    ]);
    expect(output.counts).toEqual({ savedInsights: 1, todo: 1, inProgress: 1, completed: 1, dismissed: 0, overdue: 1 });
    expect(output.actions[2]?.outcome?.status).toBe('not_measurable');
  });

  it('filters by status and priority', async () => {
    const output = await callTool('get_decisions', { hotelId: 'sablon-bru', priorities: ['high'] }, await contextWithDecisions());
    expect(output.actions.map((action) => action.title)).toEqual(['Call the congress organiser']);
    expect(output.isFiltered).toBe(true);
  });
});

describe('asking Aurora about the decisions', () => {
  it('answers "what decisions are saved?" from the records, with the most important open action first', async () => {
    const { find, text } = await ask('what decisions are saved?', await contextWithDecisions());
    expect(find('step')).toMatchObject({ tool: 'get_decisions', label: 'Reading your saved decisions' });
    expect(find('insight')?.headline).toBe('2 open actions; first: “Call the congress organiser”.');
    expect(text).toContain('1 saved insight: “Bookings for 21–30 November are 16% behind last year”.');
    expect(text).toContain('1. “Call the congress organiser” (high priority, in progress, owner: Sales manager, due 15 November, overdue)');
    expect(find('trail')?.stages.at(-1)?.action).toEqual({ kind: 'navigate', label: 'Open Decisions', destination: 'decisions' });
    expect(find('done')).toMatchObject({ answerKind: 'analysis', toolsChosenBy: 'keywords' });
  });

  it('answers only the part asked for', async () => {
    const context = await contextWithDecisions();
    expect((await ask('Which actions are overdue?', context)).find('insight')?.headline).toBe('1 overdue action in Decisions.');
    expect((await ask('Which actions are dismissed?', context)).find('insight')?.headline).toBe('No dismissed actions in Decisions.');
  });

  it('says so when nothing is saved yet', async () => {
    const { find } = await ask('what decisions are saved?', createDemoToolContext());
    expect(find('insight')?.headline).toBe('Nothing is saved in Decisions yet.');
  });

  it('also follows the model when it chooses get_decisions for words the rules do not catch', async () => {
    const model: LanguageModel = {
      modelId: 'test-model',
      complete: async () => ({ text: '', toolNames: ['get_decisions'], toolCalls: [{ name: 'get_decisions', arguments: { priorities: ['high'] } }] }),
    };
    const { find } = await ask('anything urgent on my plate?', await contextWithDecisions(), new LanguageModelInsightPlanner(model));
    expect(find('insight')?.headline).toBe('1 high priority action in Decisions.');
    expect(find('done')?.toolsChosenBy).toBe('llm');
  });
});
