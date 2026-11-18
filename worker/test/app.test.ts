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
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
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
  it('returns the hotel, period and starter questions from the database', async () => {
    const response = await handleRequest(new Request('http://localhost/api/workspace'), createTestDependencies());
    const workspace = (await response.json()) as {
      hotel: { name: string; roomCount: number };
      period: { from: string; to: string };
      suggestedQuestions: Array<{ topic: string }>;
      mcp: { toolCount: number };
    };
    expect(workspace.hotel).toMatchObject({ name: 'Hotel Sablon', roomCount: 111 });
    expect(workspace.period).toEqual({ from: '2026-11-01', to: '2026-11-17' });
    expect(workspace.suggestedQuestions.map((suggestion) => suggestion.topic)).toEqual(['Revenue', 'Channels', 'Pace', 'Segments']);
    expect(workspace.mcp.toolCount).toBe(7);
  });

  it('lists the questions asked in the chat as "Recent", newest first and without duplicates', async () => {
    const dependencies = createTestDependencies();
    const pendingWork: Array<Promise<unknown>> = [];
    dependencies.waitUntil = (work) => pendingWork.push(work);
    for (const question of ['First question?', 'Second question?', 'First question?']) {
      await (await handleRequest(postChat({ question, hotelId: 'sablon-bru' }), dependencies)).text();
      await Promise.all(pendingWork);
    }
    const workspace = (await (await handleRequest(new Request('http://localhost/api/workspace'), dependencies)).json()) as {
      recentQuestions: Array<{ question: string }>;
    };
    expect(workspace.recentQuestions.map((recent) => recent.question)).toEqual(['First question?', 'Second question?']);
  });

  it('answers 404 for an unknown hotel', async () => {
    const response = await handleRequest(new Request('http://localhost/api/workspace?hotel=nowhere'), createTestDependencies());
    expect(response.status).toBe(404);
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
