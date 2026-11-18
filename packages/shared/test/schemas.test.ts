import { describe, expect, it } from 'vitest';
import { dateRangeSchema } from '../src/domain';
import { chatRequestSchema, streamEventSchema } from '../src/stream-events';

describe('stream event schema', () => {
  it('accepts a valid KPI event', () => {
    const kpiEvent = {
      type: 'kpi',
      runId: 'run_1',
      sequence: 3,
      factId: 'occupancy',
      metric: 'occupancy',
      label: 'Occupancy',
      actual: 0.62,
      reference: 0.75,
      referenceKind: 'target',
      status: 'off_track',
    };
    expect(streamEventSchema.parse(kpiEvent)).toEqual(kpiEvent);
  });

  it('accepts a figure inside the streamed text', () => {
    const parsedEvent = streamEventSchema.parse({ type: 'text_delta', runId: 'run_1', sequence: 9, text: '245 fewer room nights', factId: 'volume' });
    expect(parsedEvent.type).toBe('text_delta');
  });

  it('rejects an unknown event type', () => {
    expect(streamEventSchema.safeParse({ type: 'surprise', runId: 'run_1', sequence: 0 }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    const result = streamEventSchema.safeParse({
      type: 'step',
      runId: 'run_1',
      sequence: 1,
      stepId: 'overview',
      label: 'Checking occupancy and rate',
      tool: 'get_hotel_overview',
      status: 'maybe',
    });
    expect(result.success).toBe(false);
  });
});

describe('chat request schema', () => {
  it('trims the question', () => {
    expect(chatRequestSchema.parse({ question: '  Why?  ', hotelId: 'sablon-bru' }).question).toBe('Why?');
  });

  it('rejects empty and overly long questions', () => {
    expect(chatRequestSchema.safeParse({ question: '   ', hotelId: 'sablon-bru' }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 'x'.repeat(281), hotelId: 'sablon-bru' }).success).toBe(false);
  });
});

describe('date range schema', () => {
  it('rejects a range that ends before it starts', () => {
    expect(dateRangeSchema.safeParse({ from: '2026-11-17', to: '2026-11-01' }).success).toBe(false);
    expect(dateRangeSchema.safeParse({ from: '2026-11-01', to: '2026-11-17' }).success).toBe(true);
  });
});
