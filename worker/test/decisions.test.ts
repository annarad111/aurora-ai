import { decisionsSchema, savedInsightSchema, type NewDecisionAction, type NewSavedInsight } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest, type AppDependencies } from '../src/app';
import { InMemoryHotelDataRepository } from '../src/db/in-memory-hotel-data-repository';
import { createAction, listDecisions, removeInsight, saveInsight, updateAction } from '../src/decisions/decision-service';
import { createDemoToolContext } from '../src/demo-context';

const TODAY = '2026-11-17';

const occupancyInsight: NewSavedInsight = {
  hotelId: 'sablon-bru',
  sourceKey: 'answer:run_123',
  origin: 'answer',
  title: 'Occupancy is 62.0%, 13.0 pp below target',
  description: 'Occupancy month to date against target.',
  metric: 'occupancy',
  measure: { label: 'Occupancy', unit: 'ratio', value: 0.62, baseline: 0.75, baselineLabel: 'target' },
  period: { from: '2026-11-01', to: '2026-11-09' },
  evidence: [{ label: 'Occupancy 62.0%', factId: 'occupancy', tool: 'get_hotel_overview' }],
  sourceConversationId: '3f1f1c2a-0000-4000-8000-000000000001',
  investigation: { question: 'Why is occupancy below target?', context: null },
};

function actionFor(insightId: string, overrides: Partial<NewDecisionAction> = {}): NewDecisionAction {
  return {
    hotelId: 'sablon-bru',
    insightId,
    title: 'Review direct-booking promotion for low nights',
    description: '',
    priority: 'high',
    status: 'todo',
    owner: 'Revenue manager',
    dueDate: '2026-11-20',
    notes: '',
    startedFromSuggestion: true,
    ...overrides,
  };
}

describe('saved insights', () => {
  it('keeps one record when the same insight is saved twice', async () => {
    const context = createDemoToolContext();
    const first = await saveInsight(context, occupancyInsight, `${TODAY}T08:00:00Z`);
    const second = await saveInsight(context, { ...occupancyInsight, title: 'Saved again' }, `${TODAY}T09:00:00Z`);
    expect(first.created).toBe(true);
    expect(second).toEqual({ insight: first.insight, created: false });
    expect((await listDecisions(context, 'sablon-bru')).insights).toHaveLength(1);
  });

  it('cannot be removed while it has actions', async () => {
    const context = createDemoToolContext();
    const { insight } = await saveInsight(context, occupancyInsight, `${TODAY}T08:00:00Z`);
    await createAction(context, actionFor(insight.id), `${TODAY}T08:05:00Z`);
    await expect(removeInsight(context, 'sablon-bru', insight.id)).rejects.toMatchObject({ status: 409, code: 'insight_has_actions' });
  });

  it('skips a stored record it can no longer read, and says how many', async () => {
    const context = createDemoToolContext();
    await saveInsight(context, occupancyInsight, `${TODAY}T08:00:00Z`);
    const repository = context.repository as InMemoryHotelDataRepository;
    repository.decisionRecords.push(
      { ...repository.decisionRecords[0]!, id: 'damaged-record', sourceKey: 'x', recordJson: '{"title": 42' },
      { ...repository.decisionRecords[0]!, id: 'future-format', sourceKey: 'y', recordVersion: 99 },
    );
    const decisions = await listDecisions(context, 'sablon-bru');
    expect(decisions.insights).toHaveLength(1);
    expect(decisions.unreadableRecordCount).toBe(2);
  });
});

describe('actions', () => {
  it('stamps completedAt when completed and clears it when reopened', async () => {
    const context = createDemoToolContext();
    const { insight } = await saveInsight(context, occupancyInsight, `${TODAY}T08:00:00Z`);
    const action = await createAction(context, actionFor(insight.id), `${TODAY}T08:05:00Z`);
    const completed = await updateAction(context, 'sablon-bru', action.id, { status: 'completed', notes: 'Promotion live' }, '2026-11-18T10:00:00Z');
    expect(completed).toMatchObject({ status: 'completed', completedAt: '2026-11-18T10:00:00Z', notes: 'Promotion live' });
    const reopened = await updateAction(context, 'sablon-bru', action.id, { status: 'in_progress' }, '2026-11-18T11:00:00Z');
    expect(reopened.completedAt).toBeNull();
  });

  it('needs a saved insight', async () => {
    await expect(createAction(createDemoToolContext(), actionFor('not-a-saved-insight'), TODAY)).rejects.toMatchObject({ status: 404 });
  });
});

describe('outcomes', () => {
  it('is not yet measurable while there are no nights after completion', async () => {
    const context = createDemoToolContext();
    const { insight } = await saveInsight(context, occupancyInsight, `${TODAY}T08:00:00Z`);
    await createAction(context, actionFor(insight.id, { status: 'completed' }), `${TODAY}T08:05:00Z`);
    const [outcome] = Object.values((await listDecisions(context, 'sablon-bru')).outcomes);
    expect(outcome).toEqual({ status: 'not_measurable', reason: expect.stringMatching(/^Outcome not yet measurable/) });
  });

  it('shows the same figure on the nights since, without claiming the action caused it', async () => {
    const context = createDemoToolContext();
    const { insight } = await saveInsight(context, occupancyInsight, '2026-11-09T08:00:00Z');
    await createAction(context, actionFor(insight.id, { status: 'completed' }), '2026-11-13T08:05:00Z');
    const [outcome] = Object.values((await listDecisions(context, 'sablon-bru')).outcomes);
    expect(outcome).toMatchObject({
      status: 'observed',
      label: 'Occupancy',
      before: 0.62,
      beforeLabel: 'When saved, 1–9 Nov 2026',
      afterLabel: 'Since completed, 14–17 Nov 2026',
    });
    expect(JSON.stringify(outcome)).not.toMatch(/because|caused|thanks to/i);
  });

  it('does not compare totals over periods of different length', async () => {
    const context = createDemoToolContext();
    const { insight } = await saveInsight(context, { ...occupancyInsight, sourceKey: 'revenue', metric: 'room_revenue', measure: { ...occupancyInsight.measure!, unit: 'currency', value: 208_000 } }, TODAY);
    await createAction(context, actionFor(insight.id, { status: 'completed' }), '2026-11-10T08:00:00Z');
    const [outcome] = Object.values((await listDecisions(context, 'sablon-bru')).outcomes);
    expect(outcome?.status).toBe('not_measurable');
  });
});

describe('the decisions API', () => {
  const dependencies = (): AppDependencies => ({
    toolContext: createDemoToolContext(),
    config: { today: TODAY, stepDelayMs: 0, textTokenDelayMs: 0, narrativeProvider: 'scripted', aiModel: 'none', aiTimeoutMs: 0 },
    languageModel: null,
    mcpToken: null,
    rateLimiters: { chat: null, mcp: null },
    waitUntil: () => {},
  });
  const send = (app: AppDependencies, method: string, path: string, body?: unknown) =>
    handleRequest(
      new Request(`http://localhost${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }),
      app,
    );

  it('saves, creates an action, changes it and reads everything back', async () => {
    const app = dependencies();
    const saved = await send(app, 'POST', '/api/decisions/insights', occupancyInsight);
    expect(saved.status).toBe(201);
    const insight = savedInsightSchema.parse(await saved.json());
    expect((await send(app, 'POST', '/api/decisions/insights', occupancyInsight)).status).toBe(200);

    const created = await send(app, 'POST', '/api/decisions/actions', actionFor(insight.id));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await send(app, 'PATCH', `/api/decisions/actions/${id}?hotel=sablon-bru`, { status: 'in_progress', owner: 'Ana' })).status).toBe(200);

    const decisions = decisionsSchema.parse(await (await send(app, 'GET', '/api/decisions?hotel=sablon-bru')).json());
    expect(decisions.actions).toEqual([expect.objectContaining({ id, status: 'in_progress', owner: 'Ana' })]);
    expect((await send(app, 'DELETE', `/api/decisions/insights/${insight.id}?hotel=sablon-bru`)).status).toBe(409);
    expect((await send(app, 'DELETE', `/api/decisions/actions/${id}?hotel=sablon-bru`)).status).toBe(204);
    expect((await send(app, 'DELETE', `/api/decisions/insights/${insight.id}?hotel=sablon-bru`)).status).toBe(204);
  });

  it('refuses bad input and unknown hotels before storing anything', async () => {
    const app = dependencies();
    expect((await send(app, 'POST', '/api/decisions/actions', { ...actionFor('x-x-x-x-x'), title: ' ' })).status).toBe(400);
    expect((await send(app, 'POST', '/api/decisions/insights', { ...occupancyInsight, hotelId: 'nowhere' })).status).toBe(404);
    expect((await send(app, 'GET', '/api/decisions')).status).toBe(400);
  });
});
