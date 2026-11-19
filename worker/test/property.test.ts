import { propertyOverviewSchema, type StreamEvent, type StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest, type AppDependencies } from '../src/app';
import { createDemoToolContext } from '../src/demo-context';
import type { LanguageModel } from '../src/llm/language-model';
import { LanguageModelInsightPlanner } from '../src/orchestrator/insight-planners';
import { parsePropertyQuestion } from '../src/orchestrator/property-answer';
import { runInsight } from '../src/orchestrator/run-insight';
import { callTool } from '../src/tools/registry';

const TODAY = '2026-11-17';
const status = (date?: string) => callTool('get_property_status', { hotelId: 'sablon-bru', ...(date ? { date } : {}) }, createDemoToolContext());

describe('get_property_status', () => {
  it('splits tonight’s rooms into four statuses that add up to the hotel’s 111 rooms', async () => {
    const { inventory, basis, asOf, unavailableRooms } = await status();
    expect(basis).toBe('results');
    expect(asOf).toBe(TODAY);
    expect(inventory).toMatchObject({ physicalRooms: 111, occupied: 83, outOfOrder: 2, outOfService: 2, vacantAvailable: 24, sellableRooms: 107 });
    expect(inventory.occupied + inventory.vacantAvailable + inventory.outOfOrder + inventory.outOfService).toBe(inventory.physicalRooms);
    expect(inventory.occupancyOfPhysical).toBeCloseTo(83 / 111);
    expect(inventory.occupancyOfSellable).toBeCloseTo(83 / 107);
    expect(unavailableRooms.map((room) => [room.roomNumber, room.kind, room.backOn])).toEqual([
      ['305', 'out_of_order', '2026-11-22'],
      ['412', 'out_of_order', '2026-11-20'],
      ['118', 'out_of_service', '2026-11-19'],
      ['119', 'out_of_service', '2026-11-19'],
    ]);
  });

  it('reads a future night from the bookings on the books, never as "occupied" results', async () => {
    const { inventory, basis, asOf, unavailableRooms } = await status('2026-11-24');
    expect(basis).toBe('on_the_books');
    expect(asOf).toBe(TODAY);
    expect(inventory).toMatchObject({ occupied: 49, outOfOrder: 1, vacantAvailable: 61 });
    expect(unavailableRooms.map((room) => room.roomNumber)).toEqual(['610']);
  });

  it('says so for a night without data, and leaves arrivals out (they are not in the data)', async () => {
    await expect(status('2024-01-01')).rejects.toThrow(/no results/);
    expect((await status()).arrivalsAndDepartures).toBeNull();
  });
});

describe('recognising a question about the rooms', () => {
  it('reads what is asked, and for which night', () => {
    expect(parsePropertyQuestion('How many rooms are available?', TODAY)).toEqual({ kind: 'inventory' });
    expect(parsePropertyQuestion('how many rooms are free tonight', TODAY)).toEqual({ kind: 'inventory', date: TODAY });
    expect(parsePropertyQuestion('How many rooms are available on 24 November?', TODAY)).toEqual({ kind: 'inventory', date: '2026-11-24' });
    expect(parsePropertyQuestion('Which rooms are out of order?', TODAY)).toEqual({ kind: 'maintenance' });
    expect(parsePropertyQuestion('How many rooms does the hotel have?', TODAY)).toEqual({ kind: 'profile' });
    expect(parsePropertyQuestion('How many arrivals do we have today?', TODAY)).toEqual({ kind: 'arrivals', date: TODAY });
  });

  it('leaves questions about sales over a period to the analyses', () => {
    expect(parsePropertyQuestion('How many rooms did we sell last week?', TODAY)).toBeNull();
    expect(parsePropertyQuestion('Why is revenue below target this month?', TODAY)).toBeNull();
  });
});

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

describe('asking Aurora about the rooms', () => {
  it('answers from the data, with a button to the room inventory', async () => {
    const { find, text } = await ask('How many rooms are available?');
    expect(find('step')).toMatchObject({ tool: 'get_property_status' });
    expect(find('insight')?.headline).toBe('24 rooms are vacant and available tonight (17 November).');
    expect(text).toContain("Of the hotel's 111 rooms, 83 are occupied (74.8%), 2 out of order and 2 out of service, which leaves 24 vacant and available.");
    expect(text).toContain('room 305 (air conditioning repair, back on 22 November)');
    expect(find('trail')?.stages.at(-1)?.action).toEqual({ kind: 'navigate', label: 'See the room inventory', destination: 'property', section: 'inventory' });
    expect(find('provenance')).toMatchObject({ factId: 'property_rooms', tool: 'get_property_status' });
  });

  it('is honest about arrivals and departures', async () => {
    expect((await ask('How many arrivals do we have today?')).find('insight')?.headline).toBe('Arrivals and departures are not in Aurora’s data.');
  });

  it('sends "how many rooms does the hotel have" to the property section', async () => {
    const { find, text } = await ask('How many rooms does the hotel have?');
    expect(text).toContain('58 × Classic Double, 33 × Superior Double, 14 × Deluxe King and 6 × Junior Suite');
    expect(find('trail')?.stages.at(-1)?.action).toMatchObject({ destination: 'property', section: 'identity' });
  });

  it('links "revenue last month" to the financial snapshot', async () => {
    const { find } = await ask('How much revenue did we make last month?');
    expect(find('insight')?.headline).toBe('Room revenue was €447,727 for Oct 2026.');
    expect(find('trail')?.stages.at(-1)?.action).toEqual({ kind: 'navigate', label: 'See the financial snapshot', destination: 'property', section: 'financials' });
  });

  it('follows the model when it chooses get_property_status for other words', async () => {
    const model: LanguageModel = {
      modelId: 'test-model',
      complete: async () => ({ text: '', toolNames: ['get_property_status'], toolCalls: [{ name: 'get_property_status', arguments: { date: '2026-11-24' } }] }),
    };
    const { find } = await ask('can we still take a group of 40 on the 24th?', new LanguageModelInsightPlanner(model));
    expect(find('insight')?.headline).toBe('61 rooms can still be sold for 24 November.');
    expect(find('done')?.toolsChosenBy).toBe('llm');
  });
});

describe('GET /api/property', () => {
  const dependencies = (): AppDependencies => ({
    toolContext: createDemoToolContext(),
    config: { today: TODAY, stepDelayMs: 0, textTokenDelayMs: 0, narrativeProvider: 'scripted', aiModel: 'none', aiTimeoutMs: 0 },
    languageModel: null,
    mcpToken: null,
    rateLimiters: { chat: null, mcp: null },
    waitUntil: () => {},
  });

  it('returns tonight’s rooms and the previous completed month, with every month that has results', async () => {
    const response = await handleRequest(new Request('http://localhost/api/property?hotel=sablon-bru'), dependencies());
    expect(response.status).toBe(200);
    const overview = propertyOverviewSchema.parse(await response.json());
    expect(overview.financial.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(overview.financial.kpis.map((kpi) => kpi.metric)).toEqual(['room_revenue', 'occupancy', 'adr', 'revpar']);
    expect(overview.financial.monthlyRevenue.map((month) => [month.label, month.isComplete])).toEqual([
      ['Aug 2026', true],
      ['Sep 2026', true],
      ['Oct 2026', true],
      ['Nov 2026', false],
    ]);
    expect(overview.financial.historyStart).toBe('2026-08-01');
    expect(overview.status.inventory.vacantAvailable).toBe(24);
  });

  it('needs a known hotel', async () => {
    expect((await handleRequest(new Request('http://localhost/api/property'), dependencies())).status).toBe(400);
    expect((await handleRequest(new Request('http://localhost/api/property?hotel=nowhere'), dependencies())).status).toBe(404);
  });
});
