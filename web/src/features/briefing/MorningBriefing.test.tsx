import { BRIEFING_SOURCES, type BriefingInsight, type MorningBriefing as MorningBriefingData } from '@aurora/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { describeItemCount, formatLongDate, formatMeasureDelta, formatMeasureValue, greetingFor } from './briefing-display';
import { MorningBriefing } from './MorningBriefing';
import type { MorningBriefingState } from './useMorningBriefing';

const paceItem: BriefingInsight = {
  id: 'pace:2026-11-21:2026-11-30',
  priority: 'critical',
  topic: 'Booking pace',
  title: 'Bookings for 21–30 November are 16% behind last year',
  explanation: '612 room nights are on the books, against 731 at this point last year.',
  measure: { label: 'Room nights on the books', unit: 'count', value: 612, baseline: 731, baselineLabel: 'last year at this point', deltaStyle: 'relative_percent' },
  period: { from: '2026-11-21', to: '2026-11-30' },
  source: 'Bookings on the books, counted 17 November',
  sourceTool: 'get_booking_pace',
  action: {
    label: 'Investigate the pace',
    question: 'Are we on pace for 21–30 Nov 2026?',
    context: { origin: 'briefing', intent: 'booking_pace', dateRange: { from: '2026-11-21', to: '2026-11-30' } },
  },
};

function briefing(overrides: Partial<MorningBriefingData> = {}): MorningBriefingData {
  return {
    hotelId: 'sablon-bru',
    hotelName: 'Hotel Sablon',
    reportDate: '2026-11-17',
    dataThrough: '2026-11-17',
    bookingsSnapshotDate: '2026-11-17',
    insights: [paceItem],
    unavailableSources: [],
    ...overrides,
  };
}

function render(state: MorningBriefingState): string {
  return renderToStaticMarkup(<MorningBriefing state={state} onRetry={() => {}} onInvestigate={() => {}} hour={8} />);
}

describe('how the briefing reads', () => {
  it('greets by the time of day and counts the items in words', () => {
    expect([greetingFor(8), greetingFor(14), greetingFor(21)]).toEqual(['Good morning', 'Good afternoon', 'Good evening']);
    expect(describeItemCount(3)).toBe('Here are the three things that deserve your attention today.');
    expect(describeItemCount(1)).toBe('Here is the one thing that deserves your attention today.');
    expect(formatLongDate('2026-11-17')).toBe('Tuesday 17 November');
  });

  it('writes each figure against its baseline', () => {
    expect(formatMeasureValue('count', 612)).toBe('612');
    expect(formatMeasureDelta(paceItem.measure)).toBe('−16%');
    expect(formatMeasureDelta({ ...paceItem.measure, unit: 'ratio', value: 0.477, baseline: 0.347, deltaStyle: 'percentage_points' })).toBe('+13.0 pp');
  });
});

describe('the briefing states', () => {
  it('shows skeletons while loading', () => {
    const html = render({ status: 'loading' });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('priority-insight--skeleton');
  });

  it('offers a retry when it fails', () => {
    const html = render({ status: 'failed', message: 'The server answered 500.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Retry');
  });

  it('shows each item with its priority, figure, baseline, source and action', () => {
    const html = render({ status: 'ready', briefing: briefing() });
    expect(html).toContain('Good morning.');
    expect(html).toContain('Here is the one thing');
    expect(html).toContain('Critical');
    expect(html).toContain('vs 731 last year at this point');
    expect(html).toContain('21–30 Nov 2026 · Bookings on the books, counted 17 November');
    expect(html).toContain('Investigate the pace');
    expect(html).toContain('not written by AI');
  });

  it('says when nothing needs attention', () => {
    expect(render({ status: 'ready', briefing: briefing({ insights: [] }) })).toContain('Nothing needs your attention today.');
  });

  it('says which data is missing when the briefing is partial', () => {
    const html = render({ status: 'ready', briefing: briefing({ unavailableSources: ['booking_pace'], bookingsSnapshotDate: null }) });
    expect(html).toContain('Some data could not be read (booking pace)');
    expect(html).not.toContain('bookings counted');
  });

  it('says the data is unavailable when no source could be read', () => {
    const html = render({ status: 'ready', briefing: briefing({ insights: [], unavailableSources: [...BRIEFING_SOURCES], dataThrough: null, bookingsSnapshotDate: null }) });
    expect(html).toContain('could not read any of the hotel');
    expect(html).toContain('Try again');
  });
});
