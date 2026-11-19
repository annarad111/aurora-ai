import { conversationListSchema } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest, type AppDependencies } from '../src/app';
import { createDemoToolContext } from '../src/demo-context';

function createTestDependencies(): AppDependencies {
  return {
    toolContext: createDemoToolContext(),
    config: { today: '2026-11-17', stepDelayMs: 0, textTokenDelayMs: 0, narrativeProvider: 'scripted', aiModel: 'none', aiTimeoutMs: 0 },
    languageModel: null,
    mcpToken: null,
    rateLimiters: { chat: null, mcp: null },
    waitUntil: () => {},
  };
}

/** Asks a question and waits until the answer is stored, as the Worker does with waitUntil. */
async function ask(dependencies: AppDependencies, question: string, conversationId: string) {
  const pendingWork: Array<Promise<unknown>> = [];
  dependencies.waitUntil = (work) => pendingWork.push(work);
  const request = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, hotelId: 'sablon-bru', conversationId }),
  });
  await (await handleRequest(request, dependencies)).text();
  await Promise.all(pendingWork);
}

const send = (dependencies: AppDependencies, method: string, path: string, body?: unknown) =>
  handleRequest(
    new Request(`http://localhost${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }),
    dependencies,
  );

async function listTitles(dependencies: AppDependencies) {
  const response = await send(dependencies, 'GET', '/api/conversations?hotel=sablon-bru');
  return conversationListSchema.parse(await response.json()).conversations.map((summary) => summary.title);
}

describe('renaming a conversation', () => {
  it('keeps the user’s title, also when a later answer would have replaced it', async () => {
    const dependencies = createTestDependencies();
    const conversationId = crypto.randomUUID();
    await ask(dependencies, 'hello', conversationId);

    const response = await send(dependencies, 'PATCH', `/api/conversations/${conversationId}?hotel=sablon-bru`, { title: '  November pace review  ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: conversationId, title: 'November pace review' });

    // Without the rename, the first question about the data would become the title.
    await ask(dependencies, 'Why is revenue below target this month?', conversationId);
    expect(await listTitles(dependencies)).toEqual(['November pace review']);
  });

  it('refuses an empty title, and a conversation of another hotel', async () => {
    const dependencies = createTestDependencies();
    const conversationId = crypto.randomUUID();
    await ask(dependencies, 'hello', conversationId);
    expect((await send(dependencies, 'PATCH', `/api/conversations/${conversationId}?hotel=sablon-bru`, { title: '   ' })).status).toBe(400);
    expect((await send(dependencies, 'PATCH', `/api/conversations/${conversationId}?hotel=another-hotel`, { title: 'Mine' })).status).toBe(404);
    expect((await send(dependencies, 'PATCH', `/api/conversations/${conversationId}`, { title: 'Mine' })).status).toBe(400);
  });
});

describe('deleting a conversation', () => {
  it('removes it with its answers, so it can no longer be opened', async () => {
    const dependencies = createTestDependencies();
    const keptId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();
    await ask(dependencies, 'Why is revenue below target this month?', keptId);
    await ask(dependencies, 'What are OTA commissions costing us this month?', deletedId);

    expect((await send(dependencies, 'DELETE', `/api/conversations/${deletedId}?hotel=sablon-bru`)).status).toBe(204);
    expect(await listTitles(dependencies)).toEqual(['Why is revenue below target this month?']);
    expect((await send(dependencies, 'GET', `/api/conversations/${deletedId}`)).status).toBe(404);
    // Deleting twice says there is nothing left to delete.
    expect((await send(dependencies, 'DELETE', `/api/conversations/${deletedId}?hotel=sablon-bru`)).status).toBe(404);
  });

  it('only through its own hotel', async () => {
    const dependencies = createTestDependencies();
    const conversationId = crypto.randomUUID();
    await ask(dependencies, 'hello', conversationId);
    expect((await send(dependencies, 'DELETE', `/api/conversations/${conversationId}?hotel=another-hotel`)).status).toBe(404);
    expect(await listTitles(dependencies)).toHaveLength(1);
  });
});
