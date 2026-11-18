import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { handleRequest, type AppDependencies } from '../src/app';
import { createDemoToolContext } from '../src/demo-context';
import type { RequestRateLimiter } from '../src/http/rate-limit';

const TEST_TOKEN = 'test-token-for-the-mcp-endpoint';
const MCP_URL = 'http://localhost/mcp';

function createTestDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    toolContext: createDemoToolContext(),
    config: { today: '2026-11-17', stepDelayMs: 0, textTokenDelayMs: 0, narrativeProvider: 'scripted', aiModel: 'none', aiTimeoutMs: 0 },
    languageModel: null,
    mcpToken: TEST_TOKEN,
    rateLimiters: { chat: null, mcp: null },
    waitUntil: () => {},
    ...overrides,
  };
}

/** A real MCP client whose HTTP requests go straight into our router, without a network. */
async function connectClient(token: string, dependencies = createTestDependencies()): Promise<Client> {
  const client = new Client({ name: 'aurora-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    // A real HTTP request always has a Host header (the MCP handler checks it against DNS rebinding);
    // an in-memory Request does not, so we add it here.
    fetch: (input, init) => {
      const request = new Request(input, init);
      request.headers.set('host', new URL(request.url).host);
      return handleRequest(request, dependencies);
    },
  });
  await client.connect(transport);
  openClients.push(client);
  return client;
}

const openClients: Client[] = [];
afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

describe('the MCP endpoint, through a real MCP client', () => {
  it('lists the seven registry tools, all marked read-only', async () => {
    const client = await connectClient(TEST_TOKEN);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'analyze_revenue_drivers',
      'get_booking_pace',
      'get_channel_mix',
      'get_group_blocks',
      'get_hotel_overview',
      'query_performance',
      'simulate_scenario',
    ]);
    tools.forEach((tool) => {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.inputSchema.properties).toHaveProperty('hotelId');
      expect(tool.outputSchema).toBeDefined();
    });
  });

  it('tells the client how to use the tools (hotel id, today, date format)', async () => {
    const client = await connectClient(TEST_TOKEN);
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toContain('"sablon-bru"');
    expect(instructions).toContain('Today is 2026-11-17');
  });

  it('returns the same numbers as the chat: the revenue gap splits into volume, mix and price', async () => {
    const client = await connectClient(TEST_TOKEN);
    const result = await client.callTool({
      name: 'analyze_revenue_drivers',
      arguments: { hotelId: 'sablon-bru', period: { from: '2026-11-01', to: '2026-11-17' } },
    });
    expect(result.isError).toBeFalsy();
    const drivers = result.structuredContent as { revenueGap: number; volumeEffect: number; mixEffect: number; purePriceEffect: number };
    expect(drivers.revenueGap).toBe(-33_917);
    expect(Math.round(drivers.volumeEffect)).toBe(-41_932);
    expect(Math.round(drivers.mixEffect)).toBe(-6240);
    expect(Math.round(drivers.purePriceEffect)).toBe(14_255);
  });

  it('answers pace for future stay dates', async () => {
    const client = await connectClient(TEST_TOKEN);
    const result = await client.callTool({
      name: 'get_booking_pace',
      arguments: { hotelId: 'sablon-bru', stayFrom: '2026-11-21', stayTo: '2026-11-30' },
    });
    expect(result.structuredContent).toMatchObject({ roomsOnTheBooks: 612, roomsOnTheBooksLastYear: 731, status: 'watch' });
  });

  it('reports bad input as a tool error the client model can read and correct', async () => {
    const client = await connectClient(TEST_TOKEN);
    const result = await client.callTool({
      name: 'get_hotel_overview',
      arguments: { hotelId: 'nowhere', period: { from: '2026-11-01', to: '2026-11-17' } },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('No hotel with id');
  });
});

describe('access control', () => {
  const initializeBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'curl', version: '1' } },
  });
  const postToMcp = (headers: Record<string, string>) =>
    new Request(MCP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: initializeBody,
    });

  it('refuses requests without a token, with a WWW-Authenticate header', async () => {
    const response = await handleRequest(postToMcp({}), createTestDependencies());
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('refuses a wrong token', async () => {
    const response = await handleRequest(postToMcp({ authorization: 'Bearer not-the-token' }), createTestDependencies());
    expect(response.status).toBe(401);
  });

  it('is disabled (503) when no token is configured', async () => {
    const response = await handleRequest(postToMcp({ authorization: `Bearer ${TEST_TOKEN}` }), createTestDependencies({ mcpToken: null }));
    expect(response.status).toBe(503);
  });

  it('answers 429 with Retry-After when the client is over its rate limit', async () => {
    const alwaysOverLimit: RequestRateLimiter = { limit: async () => ({ success: false }) };
    const dependencies = createTestDependencies({ rateLimiters: { chat: alwaysOverLimit, mcp: alwaysOverLimit } });

    const mcpResponse = await handleRequest(postToMcp({ authorization: `Bearer ${TEST_TOKEN}` }), dependencies);
    expect(mcpResponse.status).toBe(429);
    expect(mcpResponse.headers.get('retry-after')).toBe('60');

    const chatResponse = await handleRequest(
      new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ question: 'Why?', hotelId: 'sablon-bru' }) }),
      dependencies,
    );
    expect(chatResponse.status).toBe(429);
  });

  it('rate limits per client: the key includes the route and the IP address', async () => {
    const keys: string[] = [];
    const recordingLimiter: RequestRateLimiter = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };
    await handleRequest(
      postToMcp({ authorization: `Bearer ${TEST_TOKEN}`, 'cf-connecting-ip': '203.0.113.7' }),
      createTestDependencies({ rateLimiters: { chat: null, mcp: recordingLimiter } }),
    );
    expect(keys).toEqual(['mcp:203.0.113.7']);
  });
});
