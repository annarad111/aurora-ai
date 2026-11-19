import type { BookingPaceOutput } from '@aurora/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialRunState, runReducer } from '../../stream/run-reducer';
import { BookingPaceCard } from './BookingPaceCard';

const pace: BookingPaceOutput = {
  stayFrom: '2026-11-21',
  stayTo: '2026-11-30',
  snapshotDate: '2026-11-17',
  roomsOnTheBooks: 612,
  roomsOnTheBooksLastYear: 731,
  changeVsLastYear: -0.16,
  pickupLast7Days: 38,
  pickupLast7DaysLastYear: 61,
  status: 'watch',
  stayDates: [
    { stayDate: '2026-11-21', roomsOnTheBooks: 58, roomsOnTheBooksLastYear: 70 },
    { stayDate: '2026-11-22', roomsOnTheBooks: 64, roomsOnTheBooksLastYear: 72 },
  ],
};

function renderCard() {
  return renderToStaticMarkup(
    <BookingPaceCard
      pace={pace}
      interaction={{ activeFactId: null, focusedFactId: null, hoverFact: () => {}, focusFact: () => {} }}
      onShowProvenance={() => {}}
      onExpand={() => {}}
      actionOptions={{ hasEvidenceFor: () => true, canOpenView: () => true }}
      onAction={() => {}}
      onAskQuestion={() => {}}
    />,
  );
}

describe('the pace card tells people about the what-if', () => {
  it('names the what-if on the expand button and offers it in a callout, with a way to ask Aurora', () => {
    const html = renderCard();
    expect(html).toContain('Expand · What-if');
    expect(html).toContain('What if?');
    expect(html).toContain('Open the simulator');
    expect(html).toContain('Ask Aurora');
  });
});

describe('the run keeps its hotel', () => {
  it('reads it from run_started, so the simulator can open from a what-if answer', () => {
    const run = runReducer(runReducer(initialRunState, { type: 'run_requested', question: 'What if?' }), {
      type: 'event_received',
      event: { type: 'run_started', runId: 'run_1', sequence: 0, question: 'What if?', hotelId: 'sablon-bru' },
    });
    expect(run.hotelId).toBe('sablon-bru');
  });
});
