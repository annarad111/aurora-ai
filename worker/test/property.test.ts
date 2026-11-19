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
    expect(text).toContain('room 305 on floor 3 (air conditioning repair, back on 22 November)');
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

describe('get_room_events', () => {
  const roomEvents = (input: Record<string, unknown> = {}) => callTool('get_room_events', { hotelId: 'sablon-bru', ...input }, createDemoToolContext());

  it('groups rooms with the same work, gives each event a status, and measures every night', async () => {
    const { events } = await roomEvents();
    expect(events.map((event) => [event.id, event.status])).toEqual([
      ['maint-203-plumbing', 'completed'],
      ['maint-305-air-conditioning', 'in_progress'],
      ['maint-412-water-leak', 'in_progress'],
      ['maint-118-carpet+maint-119-carpet', 'in_progress'],
      ['maint-610-window', 'scheduled'],
    ]);
    const carpet = events.find((event) => event.roomNumbers.length === 2)!;
    expect(carpet.impact.roomNights).toBe(4);
  });

  it('says a room under maintenance only costs a sale on a full night, and uses bookings for future nights', async () => {
    const [airConditioning] = (await roomEvents({ roomNumber: '305' })).events;
    expect(airConditioning!.impact.nightsFull).toBe(0);
    expect(airConditioning!.impact.fewestVacant).toEqual({ rooms: 24, date: TODAY });
    const tonight = airConditioning!.impact.nights.find((night) => night.date === TODAY)!;
    // The same vacant rooms as the inventory tonight: 111 − 83 sold − 4 unsellable.
    expect(tonight).toEqual({ date: TODAY, basis: 'results', vacantRooms: 24, isFull: false });
    expect(airConditioning!.impact.nights.filter((night) => night.basis === 'on_the_books').map((night) => night.date)[0]).toBe('2026-11-18');
  });

  it('finds one event by id, and nothing for a room without maintenance', async () => {
    expect((await roomEvents({ eventId: 'maint-119-carpet' })).events.map((event) => event.id)).toEqual(['maint-118-carpet+maint-119-carpet']);
    expect((await roomEvents({ roomNumber: '101' })).events).toEqual([]);
  });
});

describe('asking Aurora about maintenance', () => {
  it('answers "did the repair in room 305 cost us anything?" from the full nights, with a button to the events', async () => {
    const { find, text } = await ask('Did the repair in room 305 cost us anything?');
    expect(find('step')).toMatchObject({ tool: 'get_room_events' });
    expect(find('insight')?.headline).toBe('Room 305 (air conditioning repair) has not cost a sale.');
    expect(text).toContain('the fewest was 24, on 17 November');
    expect(find('trail')?.stages.at(-1)?.action).toEqual({ kind: 'navigate', label: 'See events & alerts', destination: 'property', section: 'events' });
  });

  it('lists only running and planned work for "what maintenance is planned?"', async () => {
    const { find, text } = await ask('What maintenance is planned?');
    expect(find('insight')?.headline).toBe('4 maintenance events, none on a night the hotel was full.');
    expect(text).not.toContain('Room 203');
  });

  it('investigates one event from the property overview, with the event as structured context', async () => {
    const events: StreamEvent[] = [];
    await runInsight({
      question: 'Did the carpet replacement in room 118 and 119 cost us sales?',
      hotelId: 'sablon-bru',
      investigation: { origin: 'property', intent: 'maintenance_impact', eventId: 'maint-118-carpet+maint-119-carpet', roomNumbers: ['118', '119'] },
      toolContext: createDemoToolContext(),
      emit: async (event) => {
        events.push({ ...event, runId: 'test', sequence: events.length } as StreamEvent);
      },
      signal: new AbortController().signal,
      pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
    });
    const insight = events.find((event): event is StreamEventOfType<'insight'> => event.type === 'insight');
    expect(insight?.headline).toBe('Rooms 118 and 119 (carpet replacement) have not cost a sale.');
    expect(events.at(-1)).toMatchObject({ type: 'done', toolsChosenBy: 'context' });
  });
});

describe('events & alerts in GET /api/property', () => {
  it('lists running work first, then what is coming, then cancellations, then finished work', async () => {
    const response = await handleRequest(new Request('http://localhost/api/property?hotel=sablon-bru'), {
      toolContext: createDemoToolContext(),
      config: { today: TODAY, stepDelayMs: 0, textTokenDelayMs: 0, narrativeProvider: 'scripted', aiModel: 'none', aiTimeoutMs: 0 },
      languageModel: null,
      mcpToken: null,
      rateLimiters: { chat: null, mcp: null },
      waitUntil: () => {},
    });
    const { events } = propertyOverviewSchema.parse(await response.json());
    expect(events.map((event) => [event.type, event.id])).toEqual([
      ['maintenance', 'maint-305-air-conditioning'],
      ['maintenance', 'maint-412-water-leak'],
      ['maintenance', 'maint-118-carpet+maint-119-carpet'],
      ['maintenance', 'maint-610-window'],
      ['group_arrival', 'atelier-verdi-launch-2026'],
      ['group_cancellation', 'eu-health-congress-2026'],
      ['maintenance', 'maint-203-plumbing'],
    ]);
  });
});

describe('the KPIs on screen follow their definitions', () => {
  it('October: occupancy, ADR and RevPAR agree with each other and with the rooms and revenue', async () => {
    const overview = await callTool('get_hotel_overview', { hotelId: 'sablon-bru', period: { from: '2026-10-01', to: '2026-10-31' } }, createDemoToolContext());
    const kpi = (metric: string) => overview.kpis.find((candidate) => candidate.metric === metric)!.actual;
    const roomsAvailable = 111 * 31;
    expect(overview.roomsAvailable).toBe(roomsAvailable);
    expect(kpi('occupancy')).toBeCloseTo(overview.roomsSold / roomsAvailable, 10);
    expect(kpi('adr')).toBeCloseTo(overview.roomRevenue / overview.roomsSold, 10);
    expect(kpi('revpar')).toBeCloseTo(overview.roomRevenue / roomsAvailable, 10);
    expect(kpi('revpar')).toBeCloseTo(kpi('adr') * kpi('occupancy'), 10);
    expect(kpi('room_revenue')).toBe(overview.roomRevenue);
  });

  it('counts tonight’s occupied rooms as the rooms sold that night in the results', async () => {
    const stats = await createDemoToolContext().repository.listDailyStats('sablon-bru', { from: TODAY, to: TODAY });
    expect((await status()).inventory.occupied).toBe(stats.reduce((sum, row) => sum + row.roomsSold, 0));
  });
});
