import { newSavedInsightSchema, type BriefingInsight, type Decisions, type SavedInsight } from '@aurora/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialRunState, runReducer, type RunState } from '../../stream/run-reducer';
import { DecisionWorkspace, OutcomeReview } from './DecisionWorkspace';
import { insightFromAnswer, insightFromBriefing, suggestActionFor } from './insight-sources';
import type { DecisionsState, DecisionsStore } from './useDecisions';

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
    context: { origin: 'briefing', intent: 'booking_pace', metric: 'booking_pace', dateRange: { from: '2026-11-21', to: '2026-11-30' } },
  },
};

const savedPace: SavedInsight = { ...insightFromBriefing(paceItem, 'sablon-bru'), id: 'insight-0001', createdAt: '2026-11-19T08:00:00Z' };

function finishedPaceAnswer(): RunState {
  const events = [
    { type: 'run_started', question: 'Are we on pace?', hotelId: 'sablon-bru' },
    { type: 'insight', headline: 'Bookings for 21–30 November are 16% behind last year.', impactEur: null, factIds: ['booking_pace'], chips: [] },
    {
      type: 'chart',
      chart: {
        kind: 'booking_pace',
        data: {
          stayFrom: '2026-11-21', stayTo: '2026-11-30', snapshotDate: '2026-11-17', roomsOnTheBooks: 612, roomsOnTheBooksLastYear: 731,
          changeVsLastYear: -0.16, pickupLast7Days: 38, pickupLast7DaysLastYear: 61, status: 'watch', stayDates: [],
        },
      },
      factIds: ['booking_pace'],
    },
    { type: 'text_delta', text: 'Bookings are behind.' },
    {
      type: 'provenance', factId: 'booking_pace', title: 'Booking pace', displayValue: '−16%', tool: 'get_booking_pace', formula: '', inputs: [],
      sourceQuery: '', contextLabel: 'Pace', contextText: '', exploreView: 'pace', followupQuestions: [],
    },
    {
      type: 'done', durationMs: 10, provider: 'scripted', verifiedFigureCount: 1, answerKind: 'analysis',
      context: { intent: 'booking_pace', period: { from: '2026-11-21', to: '2026-11-30' } },
    },
  ];
  return events.reduce<RunState>(
    (state, event, sequence) => runReducer(state, { type: 'event_received', event: { ...event, runId: 'run_42', sequence } as never }),
    runReducer(initialRunState, { type: 'run_requested', question: 'Are we on pace?' }),
  );
}

describe('what gets saved', () => {
  it('a briefing item keeps its figure, period, source and the question that investigates it', () => {
    const insight = insightFromBriefing(paceItem, 'sablon-bru');
    expect(newSavedInsightSchema.parse(insight)).toEqual(insight);
    expect(insight).toMatchObject({
      sourceKey: 'briefing:pace:2026-11-21:2026-11-30',
      metric: 'booking_pace',
      measure: { value: 612, baseline: 731 },
      evidence: [{ label: 'Bookings on the books, counted 17 November', tool: 'get_booking_pace' }],
      investigation: { question: 'Are we on pace for 21–30 Nov 2026?' },
    });
  });

  it('an answer keeps its headline, figure, evidence and conversation; one key per run', () => {
    const insight = insightFromAnswer(finishedPaceAnswer(), 'sablon-bru', '3f1f1c2a-0000-4000-8000-000000000001');
    expect(insight && newSavedInsightSchema.parse(insight)).toEqual(insight);
    expect(insight).toMatchObject({
      sourceKey: 'answer:run_42',
      origin: 'answer',
      metric: 'booking_pace',
      measure: { value: 612, baseline: 731 },
      period: { from: '2026-11-21', to: '2026-11-30' },
      evidence: [{ label: 'Booking pace: −16%', factId: 'booking_pace', tool: 'get_booking_pace' }],
      sourceConversationId: '3f1f1c2a-0000-4000-8000-000000000001',
    });
  });

  it('nothing is offered while the answer is still streaming', () => {
    expect(insightFromAnswer(runReducer(initialRunState, { type: 'run_requested', question: 'Why?' }), 'sablon-bru', 'conversation-1')).toBeNull();
  });

  it('Aurora suggests an action from the figure, with a priority from the briefing', () => {
    expect(suggestActionFor(savedPace, 'critical')).toMatchObject({ title: 'Review direct-booking offers for 21–30 Nov 2026', priority: 'high' });
  });
});

function storeWith(state: DecisionsState): DecisionsStore {
  const unused = async () => ({ ok: true as const, value: undefined as never });
  return {
    state,
    reload: async () => {},
    savedBySourceKey: new Map(),
    openActionCount: 0,
    overdueActionCount: 0,
    savedInsightCount: 0,
    saveInsight: unused,
    removeInsight: unused,
    createAction: unused,
    updateAction: unused,
    deleteAction: unused,
  };
}

function render(state: DecisionsState): string {
  return renderToStaticMarkup(<DecisionWorkspace hotelName="Hotel Sablon" store={storeWith(state)} onOpenConversation={() => {}} onInvestigateAgain={() => {}} />);
}

const decisions: Decisions = {
  insights: [savedPace],
  actions: [
    {
      id: 'action-0001', hotelId: 'sablon-bru', insightId: 'insight-0001', title: 'Review direct-booking offers', description: '', priority: 'high',
      status: 'completed', owner: 'Revenue manager', dueDate: null, notes: '', startedFromSuggestion: true,
      createdAt: '2026-11-19T08:00:00Z', updatedAt: '2026-11-19T09:00:00Z', completedAt: '2026-11-19T09:00:00Z',
    },
  ],
  outcomes: { 'action-0001': { status: 'not_measurable', reason: 'Outcome not yet measurable: bookings have not been counted again since the action was completed.' } },
  unreadableRecordCount: 1,
};

describe('the decision workspace', () => {
  it('has loading, error and empty states', () => {
    expect(render({ status: 'loading' })).toContain('aria-busy="true"');
    expect(render({ status: 'failed', message: 'The server answered 500.' })).toContain('Retry');
    expect(render({ status: 'ready', decisions: { insights: [], actions: [], outcomes: {}, unreadableRecordCount: 0 } })).toContain('Nothing saved yet');
  });

  it('shows the insight, the user’s decision and its outcome, each for what it is', () => {
    const html = render({ status: 'ready', decisions });
    expect(html).toContain('1 saved insight · 0 open actions · 1 completed');
    expect(html).toContain('Morning briefing');
    expect(html).toContain('Your decision (from Aurora’s suggestion)');
    expect(html).toContain('Outcome not yet measurable');
    expect(html).toContain('Investigate again on today’s data');
    expect(html).toContain('1 saved record could not be read');
    // An insight with actions cannot be removed.
    expect(html).not.toContain('>Remove<');
  });

  it('an observed outcome never claims the action caused it', () => {
    const html = renderToStaticMarkup(
      <OutcomeReview
        outcome={{ status: 'observed', label: 'Occupancy', unit: 'ratio', before: 0.62, beforeLabel: 'When saved', after: 0.68, afterLabel: 'Since completed' }}
      />,
    );
    expect(html).toContain('62%');
    expect(html).toContain('68%');
    expect(html).toContain('Not verified as caused by this action');
  });
});
