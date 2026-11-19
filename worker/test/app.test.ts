import { streamEventSchema } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest, type AppDependencies } from '../src/app';
import { createDemoToolContext } from '../src/demo-context';
import { formatSseMessage } from '../src/sse/sse-event-stream';

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

function postChat(body: unknown): Request {
  // Every question belongs to a conversation; tests that do not care use a fresh one.
  const withConversation =
    typeof body === 'object' && body !== null && !('conversationId' in body) ? { ...body, conversationId: crypto.randomUUID() } : body;
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof withConversation === 'string' ? withConversation : JSON.stringify(withConversation),
  });
}

/** Asks a question and waits until the answer is stored, as the Worker does with waitUntil. */
async function ask(dependencies: AppDependencies, question: string, conversationId: string) {
  const pendingWork: Array<Promise<unknown>> = [];
  dependencies.waitUntil = (work) => pendingWork.push(work);
  const events = readSseEvents(await (await handleRequest(postChat({ question, hotelId: 'sablon-bru', conversationId }), dependencies)).text());
  await Promise.all(pendingWork);
  return events;
}

/** Splits an SSE body into its `data:` payloads. */
function readSseEvents(body: string) {
  return body
    .split('\n\n')
    .map((block) => block.split('\n').find((line) => line.startsWith('data: ')))
    .filter((line): line is string => line !== undefined)
    .map((line) => streamEventSchema.parse(JSON.parse(line.slice('data: '.length))));
}

describe('formatSseMessage', () => {
  it('writes id, event and data lines, ended by a blank line', () => {
    const message = formatSseMessage({ type: 'followups', runId: 'run_1', sequence: 4, questions: ['Why?'] });
    expect(message).toBe('id: 4\nevent: followups\ndata: {"type":"followups","runId":"run_1","sequence":4,"questions":["Why?"]}\n\n');
  });
});

describe('POST /api/chat', () => {
  it('streams a full answer as text/event-stream', async () => {
    const response = await handleRequest(postChat({ question: 'Why is my hotel revenue below target this month?', hotelId: 'sablon-bru' }), createTestDependencies());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = readSseEvents(await response.text());
    expect(events[0]?.type).toBe('run_started');
    expect(events.at(-1)?.type).toBe('done');
    // One run id for the whole stream.
    expect(new Set(events.map((event) => event.runId)).size).toBe(1);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await handleRequest(postChat('not json'), createTestDependencies());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_json' } });
  });

  it('answers 400 for an empty or too long question', async () => {
    expect((await handleRequest(postChat({ question: ' ', hotelId: 'sablon-bru' }), createTestDependencies())).status).toBe(400);
    expect((await handleRequest(postChat({ question: 'x'.repeat(281), hotelId: 'sablon-bru' }), createTestDependencies())).status).toBe(400);
  });

  it('answers 404 for an unknown hotel, before opening a stream', async () => {
    const response = await handleRequest(postChat({ question: 'Why?', hotelId: 'nowhere' }), createTestDependencies());
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('answers 405 for GET', async () => {
    expect((await handleRequest(new Request('http://localhost/api/chat'), createTestDependencies())).status).toBe(405);
  });
});

describe('GET /api/workspace', () => {
  it('returns the hotel, the period and starter questions written from the data', async () => {
    const response = await handleRequest(new Request('http://localhost/api/workspace'), createTestDependencies());
    const workspace = (await response.json()) as {
      hotel: { name: string; roomCount: number };
      period: { from: string; to: string };
      suggestions: Array<{ topic: string; question: string }>;
      mcp: { toolCount: number };
    };
    expect(workspace.hotel).toMatchObject({ name: 'Hotel Sablon', roomCount: 111 });
    expect(workspace.period).toEqual({ from: '2026-11-01', to: '2026-11-17' });
    // Revenue is below target, pace is behind, OTA share rose and a congress was cancelled in the demo data.
    expect(workspace.suggestions).toEqual([
      { topic: 'Revenue', question: 'Why is revenue below target this month?' },
      { topic: 'Pace', question: 'Are we on pace for 21–30 Nov 2026?' },
      { topic: 'Channels', question: 'What are OTA commissions costing us this month?' },
      { topic: 'Groups', question: 'Are other group blocks at risk this quarter?' },
    ]);
    expect(workspace.mcp.toolCount).toBe(9);
  });

  it('answers 404 for an unknown hotel', async () => {
    const response = await handleRequest(new Request('http://localhost/api/workspace?hotel=nowhere'), createTestDependencies());
    expect(response.status).toBe(404);
  });
});

describe('conversations', () => {
  it('stores every finished answer and lists the conversation under "Recent"', async () => {
    const dependencies = createTestDependencies();
    await ask(dependencies, 'hello', 'conversation-a');
    await ask(dependencies, 'Why is my hotel revenue below target this month?', 'conversation-a');

    const list = (await (await handleRequest(new Request('http://localhost/api/conversations?hotel=sablon-bru'), dependencies)).json()) as {
      conversations: Array<{ id: string; title: string; turnCount: number }>;
    };
    // The greeting does not name the conversation; the first question about the data does.
    expect(list.conversations).toEqual([
      expect.objectContaining({ id: 'conversation-a', title: 'Why is my hotel revenue below target this month?', turnCount: 2 }),
    ]);
  });

  it('opens an old conversation with the exact events that were streamed, without running it again', async () => {
    const dependencies = createTestDependencies();
    const streamed = await ask(dependencies, 'Why is my hotel revenue below target this month?', 'conversation-b');
    const conversation = (await (await handleRequest(new Request('http://localhost/api/conversations/conversation-b'), dependencies)).json()) as {
      turns: Array<{ question: string; events: unknown[] }>;
    };
    expect(conversation.turns).toHaveLength(1);
    expect(conversation.turns[0]?.events).toEqual(streamed);
  });

  it('answers a follow-up from what the stored answer covered', async () => {
    const dependencies = createTestDependencies();
    await ask(dependencies, 'What was ADR by channel in October?', 'conversation-c');
    const followUp = await ask(dependencies, 'and November?', 'conversation-c');
    const done = followUp.find((event) => event.type === 'done');
    expect(done).toMatchObject({ followUpOf: 'What was ADR by channel in October?', context: { query: { groupBy: 'channel' } } });
  });

  it('answers 404 for a conversation that does not exist', async () => {
    const response = await handleRequest(new Request('http://localhost/api/conversations/missing-one'), createTestDependencies());
    expect(response.status).toBe(404);
  });
});

describe('talking with Aurora', () => {
  it('"hello" gets a greeting and suggestions from the data, without running the tools', async () => {
    const events = await ask(createTestDependencies(), 'hello', crypto.randomUUID());
    const text = events.flatMap((event) => (event.type === 'text_delta' ? [event.text] : [])).join('');
    expect(text).toBe('Hello, what would you like to see today about your business?');
    expect(events.some((event) => event.type === 'step')).toBe(false);
    expect(events.find((event) => event.type === 'followups')).toMatchObject({ questions: expect.arrayContaining(['Why is revenue below target this month?']) });
    expect(events.at(-1)).toMatchObject({ type: 'done', answerKind: 'conversation' });
  });

  it('a question outside the hotel business is declined politely', async () => {
    const events = await ask(createTestDependencies(), 'What is the capital of France?', crypto.randomUUID());
    const text = events.flatMap((event) => (event.type === 'text_delta' ? [event.text] : [])).join('');
    expect(text).toMatch(/^I can only help with the business of Hotel Sablon/);
  });
});

describe('other routes', () => {
  it('GET /api/health reports a seeded database', async () => {
    const response = await handleRequest(new Request('http://localhost/api/health'), createTestDependencies());
    expect(await response.json()).toEqual({ status: 'ok', database: 'seeded', today: '2026-11-17' });
  });

  it('GET /api/hotels/:id/overview returns the overview for month to date, without AI', async () => {
    const response = await handleRequest(new Request('http://localhost/api/hotels/sablon-bru/overview'), createTestDependencies());
    const overview = (await response.json()) as { roomsSold: number; roomRevenue: number };
    expect(overview.roomsSold).toBe(1170);
    expect(overview.roomRevenue).toBe(208_260);
  });

  it('GET /api/hotels/:id/overview answers 404 for an unknown hotel', async () => {
    const response = await handleRequest(new Request('http://localhost/api/hotels/nowhere/overview'), createTestDependencies());
    expect(response.status).toBe(404);
  });

  it('answers 404 JSON for an unknown API route', async () => {
    const response = await handleRequest(new Request('http://localhost/api/nothing-here'), createTestDependencies());
    expect(response.status).toBe(404);
  });
});
