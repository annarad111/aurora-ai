import { morningBriefingSchema, streamEventSchema, type StreamEvent } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest, type AppDependencies } from '../src/app';
import { createDemoToolContext } from '../src/demo-context';
import { planForInvestigation } from '../src/orchestrator/insight-plan';
import { buildMorningBriefing, rankBriefingItems } from '../src/orchestrator/morning-briefing';
import { runInsight } from '../src/orchestrator/run-insight';
import { callTool } from '../src/tools/registry';
import type { ToolContext } from '../src/tools/tool-context';

const TODAY = '2026-11-17';

async function demoBriefing(context: ToolContext = createDemoToolContext()) {
  const hotel = (await context.repository.findHotel('sablon-bru'))!;
  return buildMorningBriefing(context, hotel);
}

describe('the morning briefing', () => {
  it('ranks the demo data: pace first, then the revenue gap, then the booking sites', async () => {
    const briefing = await demoBriefing();
    expect(morningBriefingSchema.parse(briefing)).toEqual(briefing);
    expect(briefing.insights.map((insight) => [insight.priority, insight.title])).toEqual([
      ['critical', 'Bookings for 21–30 November are 16% behind last year'],
      ['critical', 'Room revenue is €33.9k below target'],
      ['important', 'Booking sites bring 48% of room revenue, up from 35%'],
    ]);
    expect(briefing.dataThrough).toBe(TODAY);
    expect(briefing.unavailableSources).toEqual([]);
  });

  it('takes every figure from the tool it names', async () => {
    const context = createDemoToolContext();
    const briefing = await demoBriefing(context);
    const pace = await callTool('get_booking_pace', { hotelId: 'sablon-bru', stayFrom: '2026-11-21', stayTo: '2026-11-30' }, context);
    const paceItem = briefing.insights[0]!;
    expect(paceItem.sourceTool).toBe('get_booking_pace');
    expect(paceItem.measure).toMatchObject({ value: pace.roomsOnTheBooks, baseline: pace.roomsOnTheBooksLastYear });
  });

  it('opens each item with its own analysis and dates, not with words to re-parse', async () => {
    const [pace, revenue, channels] = (await demoBriefing()).insights;
    expect(pace!.action.context).toMatchObject({ origin: 'briefing', intent: 'booking_pace', dateRange: { from: '2026-11-21', to: '2026-11-30' } });
    expect(revenue!.action.context).toMatchObject({ intent: 'revenue_gap', metric: 'room_revenue', dateRange: { from: '2026-11-01', to: TODAY } });
    expect(channels!.action.context).toMatchObject({ intent: 'channel_cost', channel: 'ota' });
  });

  it('does not repeat the cancelled congress once the revenue item explains it', async () => {
    const briefing = await demoBriefing();
    expect(briefing.insights.filter((insight) => /Congress/.test(insight.title + insight.explanation))).toHaveLength(1);
  });

  it('is partial when a source cannot be read, and built from the rest', async () => {
    const context = createDemoToolContext();
    context.repository.listOnTheBooks = async () => {
      throw new Error('on_the_books is offline');
    };
    const briefing = await demoBriefing(context);
    expect(briefing.unavailableSources).toEqual(['booking_pace']);
    expect(briefing.bookingsSnapshotDate).toBeNull();
    expect(briefing.insights[0]?.topic).toBe('Room revenue');
  });

  it('is empty when nothing is off its baseline', () => {
    expect(rankBriefingItems({}, TODAY)).toEqual([]);
  });
});

describe('an investigation from the briefing', () => {
  it('keeps future dates for pace and past dates for analyses, and ignores dates that do not fit', () => {
    const comingNights = { from: '2026-11-21', to: '2026-11-30' };
    const thisMonth = { from: '2026-11-01', to: TODAY };
    expect(planForInvestigation({ origin: 'briefing', intent: 'booking_pace', dateRange: comingNights }, TODAY).paceWindowOverride).toEqual(comingNights);
    expect(planForInvestigation({ origin: 'briefing', intent: 'booking_pace', dateRange: thisMonth }, TODAY).paceWindowOverride).toBeUndefined();
    expect(planForInvestigation({ origin: 'briefing', intent: 'revenue_gap', dateRange: thisMonth }, TODAY).periodOverride).toEqual(thisMonth);
    expect(planForInvestigation({ origin: 'briefing', intent: 'revenue_gap', dateRange: comingNights }, TODAY).periodOverride).toBeUndefined();
  });

  it('runs exactly the named analysis, whatever the wording', async () => {
    const events: StreamEvent[] = [];
    await runInsight({
      // Words the keyword rules would send to the revenue analysis.
      question: 'Why is revenue below target?',
      hotelId: 'sablon-bru',
      investigation: { origin: 'briefing', intent: 'booking_pace', insightId: 'pace:2026-11-21:2026-11-30', dateRange: { from: '2026-11-21', to: '2026-11-30' } },
      toolContext: createDemoToolContext(),
      emit: async (event) => {
        events.push({ ...event, runId: 'test', sequence: events.length } as StreamEvent);
      },
      signal: new AbortController().signal,
      pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
    });
    expect(streamEventSchema.parse(events[0])).toMatchObject({ type: 'run_started', investigation: { insightId: 'pace:2026-11-21:2026-11-30' } });
    const tools = events.flatMap((event) => (event.type === 'step' && event.status === 'done' ? [event.tool] : []));
    expect(tools).toEqual(['get_hotel_overview', 'get_booking_pace']);
    expect(events.at(-1)).toMatchObject({ type: 'done', toolsChosenBy: 'context', context: { intent: 'booking_pace' } });
  });
});

describe('GET /api/briefing', () => {
  const dependencies = (): AppDependencies => ({
    toolContext: createDemoToolContext(),
    config: { today: TODAY, stepDelayMs: 0, textTokenDelayMs: 0, narrativeProvider: 'scripted', aiModel: 'none', aiTimeoutMs: 0 },
    languageModel: null,
    mcpToken: null,
    rateLimiters: { chat: null, mcp: null },
    waitUntil: () => {},
  });

  it('answers with the briefing of the hotel', async () => {
    const response = await handleRequest(new Request('http://localhost/api/briefing?hotel=sablon-bru'), dependencies());
    expect(response.status).toBe(200);
    expect(morningBriefingSchema.parse(await response.json()).insights).toHaveLength(3);
  });

  it('needs a known hotel', async () => {
    expect((await handleRequest(new Request('http://localhost/api/briefing'), dependencies())).status).toBe(400);
    expect((await handleRequest(new Request('http://localhost/api/briefing?hotel=nowhere'), dependencies())).status).toBe(404);
  });

  it('refuses an investigation that is not one of the analyses', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: 'Hi',
        hotelId: 'sablon-bru',
        conversationId: crypto.randomUUID(),
        investigation: { origin: 'briefing', intent: 'delete_everything' },
      }),
    });
    expect((await handleRequest(request, dependencies())).status).toBe(400);
  });
});
