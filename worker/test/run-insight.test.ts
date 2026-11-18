import { streamEventSchema, type StreamEvent, type StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import { detectIntent } from '../src/orchestrator/insight-plan';
import { runInsight } from '../src/orchestrator/run-insight';
import type { StreamEventPayload } from '../src/sse/sse-event-stream';

const NO_PACING = { stepDelayMs: 0, textTokenDelayMs: 0 };

/** Runs one answer and collects its events, numbered like the real stream does. */
async function collectRun(question: string, signal = new AbortController().signal): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  await runInsight({
    question,
    hotelId: 'sablon-bru',
    toolContext: createDemoToolContext(),
    signal,
    pacing: NO_PACING,
    emit: async (payload: StreamEventPayload) => {
      events.push(streamEventSchema.parse({ ...payload, runId: 'run_test', sequence: events.length }));
    },
  });
  return events;
}

function eventsOfType<EventType extends StreamEvent['type']>(events: StreamEvent[], type: EventType): StreamEventOfType<EventType>[] {
  return events.filter((event): event is StreamEventOfType<EventType> => event.type === type);
}

describe('runInsight: "Why is my hotel revenue below target this month?"', async () => {
  const events = await collectRun('Why is my hotel revenue below target this month?');
  const types = events.map((event) => event.type);
  const explanation = eventsOfType(events, 'text_delta').map((event) => event.text).join('');

  it('starts with run_started and ends with done', () => {
    expect(types[0]).toBe('run_started');
    expect(types.at(-1)).toBe('done');
    expect(eventsOfType(events, 'error')).toHaveLength(0);
  });

  it('runs the four steps in order, each pending → running → done', () => {
    const steps = eventsOfType(events, 'step');
    expect([...new Set(steps.map((step) => step.tool))]).toEqual([
      'get_hotel_overview',
      'analyze_revenue_drivers',
      'get_channel_mix',
      'get_booking_pace',
    ]);
    for (const stepId of ['overview', 'drivers', 'channels', 'pace']) {
      expect(steps.filter((step) => step.stepId === stepId).map((step) => step.status)).toEqual(['pending', 'running', 'done']);
    }
  });

  it('sends the KPI cards: occupancy, ADR, RevPAR, then Net RevPAR after the channel step', () => {
    expect(eventsOfType(events, 'kpi').map((kpi) => kpi.metric)).toEqual(['occupancy', 'adr', 'revpar', 'net_revpar']);
  });

  it('sends the main finding before the explanation, with the design headline', () => {
    expect(types.indexOf('insight')).toBeLessThan(types.indexOf('text_delta'));
    const [insight] = eventsOfType(events, 'insight');
    expect(insight?.headline).toBe(
      'A cancelled MICE block left 204 room nights empty, and the OTA shift means net revenue is falling faster than gross.',
    );
    expect(insight?.chips.map((chip) => chip.label)).toEqual(['204 lost room nights', 'ADR +4.0%', 'OTA share 48%']);
  });

  it('writes the explanation from the tool numbers', () => {
    expect(explanation).toBe(
      'Revenue is €33,917 below target for 1–17 November. Most of the gap is volume: you sold 245 fewer room nights than planned, ' +
        'and the cancelled MICE block on 10–12 November accounts for 204 of them. Rate held up. ADR is 4.0% above target, worth €14,255, ' +
        'although the shift from MICE to leisure took back €6,240 in mix. Profit is the weaker point. OTA share rose from 35% to 48%, ' +
        'so Net RevPAR is down 16.0%, more than the 14.0% drop in RevPAR. Pace for 21–30 November is 16% behind last year, ' +
        'so the gap will widen unless you act.',
    );
  });

  it('tags every figure with a fact, and sends provenance for each of them', () => {
    const figureFactIds = eventsOfType(events, 'text_delta').flatMap((event) => (event.factId ? [event.factId] : []));
    expect(figureFactIds).toEqual(['revenue_gap', 'volume', 'volume_mice', 'adr', 'pure_price', 'mix', 'ota_share', 'net_revpar', 'revpar', 'booking_pace']);
    const provenanceIds = new Set(eventsOfType(events, 'provenance').map((provenance) => provenance.factId));
    figureFactIds.forEach((factId) => expect(provenanceIds).toContain(factId));
    expect(eventsOfType(events, 'done')[0]?.verifiedFigureCount).toBe(10);
  });

  it('gives the provenance the same value the text shows', () => {
    const gapProvenance = eventsOfType(events, 'provenance').find((provenance) => provenance.factId === 'revenue_gap');
    expect(gapProvenance?.displayValue).toBe('−€33,917');
    expect(gapProvenance?.inputs).toContainEqual({ label: 'Gap', value: '−€33,917 (−14.0%)' });
  });

  it('sends the charts for the evidence panel', () => {
    expect(eventsOfType(events, 'chart').map((chart) => chart.chart.kind)).toEqual(['occupancy_trend', 'revenue_bridge', 'channel_mix', 'booking_pace']);
  });

  it('numbers the events 0, 1, 2… without gaps', () => {
    events.forEach((event, index) => expect(event.sequence).toBe(index));
  });
});

describe('other questions use fewer tools', () => {
  it('routes questions to an intent by keyword', () => {
    expect(detectIntent('What are OTA commissions costing us this month?')).toBe('channel_cost');
    expect(detectIntent('Are we on pace for the last 10 days of November?')).toBe('booking_pace');
    expect(detectIntent('Which segment moved most vs last year?')).toBe('segment_shift');
    expect(detectIntent('Why is my hotel revenue below target this month?')).toBe('revenue_gap');
  });

  it.each([
    ['What are OTA commissions costing us this month?', ['get_hotel_overview', 'get_channel_mix']],
    ['Are we on pace for the last 10 days of November?', ['get_hotel_overview', 'get_booking_pace']],
    ['Which segment moved most vs last year?', ['get_hotel_overview', 'analyze_revenue_drivers']],
  ])('"%s" calls %j and finishes', async (question, expectedTools) => {
    const events = await collectRun(question);
    expect([...new Set(eventsOfType(events, 'step').map((step) => step.tool))]).toEqual(expectedTools);
    expect(events.at(-1)?.type).toBe('done');
    expect(eventsOfType(events, 'text_delta').length).toBeGreaterThan(10);
  });
});

describe('stopping a run', () => {
  it('stops sending events once aborted, and never sends done', async () => {
    const abortController = new AbortController();
    const events: StreamEvent[] = [];
    await runInsight({
      question: 'Why is my hotel revenue below target this month?',
      hotelId: 'sablon-bru',
      toolContext: createDemoToolContext(),
      signal: abortController.signal,
      pacing: NO_PACING,
      emit: async (payload) => {
        events.push(streamEventSchema.parse({ ...payload, runId: 'run_test', sequence: events.length }));
        // Press "Stop" as soon as the first KPI card has arrived.
        if (payload.type === 'kpi') abortController.abort();
      },
    });
    expect(events.some((event) => event.type === 'done')).toBe(false);
    expect(events.some((event) => event.type === 'text_delta')).toBe(false);
  });
});

describe('errors', () => {
  it('reports an unknown hotel as a non-recoverable error event', async () => {
    const events: StreamEvent[] = [];
    await runInsight({
      question: 'Why?',
      hotelId: 'nowhere',
      toolContext: createDemoToolContext(),
      signal: new AbortController().signal,
      pacing: NO_PACING,
      emit: async (payload) => {
        events.push(streamEventSchema.parse({ ...payload, runId: 'run_test', sequence: events.length }));
      },
    });
    expect(events.map((event) => event.type)).toEqual(['run_started', 'error']);
    expect(eventsOfType(events, 'error')[0]).toMatchObject({ code: 'unknown_hotel', recoverable: false });
  });
});
