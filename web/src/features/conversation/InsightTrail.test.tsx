import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialRunState, type RunState } from '../../stream/run-reducer';
import { InsightTrail } from './InsightTrail';

const finishedRun: RunState = {
  ...initialRunState,
  phase: 'done',
  trail: [
    { stage: 'observation', text: '612 room nights are booked for 21–30 November, 16% behind last year.', factId: 'booking_pace' },
    { stage: 'discovery', text: '24 November is the weakest night: 13 rooms fewer than last year.' },
    { stage: 'understanding', text: 'New bookings are slower too.' },
    { stage: 'decision', text: 'These nights have not happened yet.', action: { kind: 'explore', label: 'Explore recovery scenarios', view: 'pace' } },
  ],
};

const noInteraction = { activeFactId: null, focusedFactId: null, hoverFact: () => {}, focusFact: () => {} };

function render(run: RunState, isRestored: boolean): string {
  return renderToStaticMarkup(
    <InsightTrail run={run} interaction={noInteraction} isRestored={isRestored} canOpenView={() => true} onAskQuestion={() => {}} onOpenExplore={() => {}} onNavigate={() => {}} />,
  );
}

describe('the insight trail', () => {
  it('shows every step at once, without animation, for an answer opened from history', () => {
    const html = render(finishedRun, true);
    expect(html.match(/insight-trail__stage--lit/g)).toHaveLength(4);
    expect(html).not.toContain('insight-trail--animated');
    expect(html).toContain('24 November is the weakest night');
    expect(html).toContain('Explore recovery scenarios');
  });

  it('starts a live answer from placeholders, then lights the steps one by one', () => {
    const html = render(finishedRun, false);
    expect(html).toContain('insight-trail--animated');
    expect(html).not.toContain('insight-trail__stage--lit');
    expect(html).toContain('What happened');
    // The first step is next; the button of the last step waits for its step.
    expect(html).toMatch(/insight-trail__stage--observation insight-trail__stage--current/);
    expect(html).not.toContain('Explore recovery scenarios');
  });

  it('while Aurora works, the first step waits and the title says what is happening', () => {
    const working: RunState = {
      ...initialRunState,
      phase: 'streaming',
      steps: [{ stepId: 'pace', label: 'Checking bookings for the coming nights', tool: 'get_booking_pace', status: 'running' }],
    };
    const html = render(working, false);
    expect(html).toContain('Checking bookings for the coming nights…');
    expect(html).toMatch(/insight-trail__stage--observation insight-trail__stage--current/);
  });
});
