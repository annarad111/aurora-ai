import { investigationContextSchema } from '@aurora/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InvestigationPanel } from './InvestigationPanel';
import {
  actionsForSelection,
  describeInvestigationOrigin,
  summarizeSelection,
  type ActionOptions,
  type InvestigationSelection,
} from './investigation-actions';

const everything: ActionOptions = { hasEvidenceFor: () => true, canOpenView: () => true };

const congressNight: InvestigationSelection = {
  kind: 'occupancy_night',
  date: '2026-11-11',
  occupancy: 0.378,
  target: 0.937,
  lastYear: 0.748,
  cancelledBlockName: 'EU Health Congress',
};

const weakPaceNight: InvestigationSelection = { kind: 'pace_night', date: '2026-11-24', roomsOnTheBooks: 49, roomsOnTheBooksLastYear: 62 };

const occupancyKpi: InvestigationSelection = {
  kind: 'kpi',
  metric: 'occupancy',
  factId: 'occupancy',
  label: 'Occupancy',
  actual: 0.62,
  reference: 0.75,
  referenceKind: 'target',
  period: { from: '2026-11-01', to: '2026-11-17' },
};

describe('a selected night in the occupancy chart', () => {
  it('shows the night against its target and last year', () => {
    const summary = summarizeSelection(congressNight);
    expect(summary.title).toBe('Wed 11 Nov');
    expect(summary.figures).toEqual([
      { label: 'Occupancy', value: '37.8%' },
      { label: 'Target', value: '93.7%', delta: '−55.9 pp' },
      { label: 'Last year', value: '74.8%', delta: '−37.0 pp' },
    ]);
    expect(summary.note).toBe('EU Health Congress was cancelled for this night.');
  });

  it('offers to explain the drop, with the night as structured context', () => {
    const [explain, compare, evidence] = actionsForSelection(congressNight, everything);
    expect(explain).toMatchObject({ kind: 'ask', label: 'Explain this drop', question: 'Why was occupancy low on Wed 11 Nov?' });
    expect(explain?.kind === 'ask' && explain.context).toEqual({
      origin: 'chart',
      intent: 'data_question',
      interaction: 'explain',
      metric: 'occupancy',
      breakdown: 'segment',
      date: '2026-11-11',
      dateRange: { from: '2026-11-11', to: '2026-11-11' },
      selectedValue: 0.378,
      baseline: 0.937,
      baselineLabel: 'target',
    });
    expect(compare).toMatchObject({ kind: 'ask', label: 'Compare by channel' });
    expect(evidence).toEqual({ kind: 'evidence', id: 'evidence', label: 'Show supporting evidence', factId: 'occupancy' });
  });

  it('says "explain this night" when the night beat its target', () => {
    const [explain] = actionsForSelection({ ...congressNight, occupancy: 0.95 }, everything);
    expect(explain?.label).toBe('Explain this night');
  });
});

describe('a selected stay date in the pace chart', () => {
  it('asks about that night only, and offers the what-if when it can open', () => {
    const actions = actionsForSelection(weakPaceNight, everything);
    expect(actions.map((action) => action.label)).toEqual(['Explain this gap', 'Open the what-if simulator', 'Show supporting evidence']);
    expect(actions[0]?.kind === 'ask' && actions[0].context).toMatchObject({ intent: 'booking_pace', dateRange: { from: '2026-11-24', to: '2026-11-24' } });
  });

  it('leaves out what cannot be shown', () => {
    const actions = actionsForSelection(weakPaceNight, { hasEvidenceFor: () => false, canOpenView: () => false });
    expect(actions.map((action) => action.label)).toEqual(['Explain this gap']);
  });
});

describe('a selected KPI', () => {
  it('offers why, a comparison with last year and the segments, each with the KPI as context', () => {
    const actions = actionsForSelection(occupancyKpi, everything);
    expect(actions.map((action) => action.label)).toEqual([
      'Why did it change?',
      'Compare with last year',
      'Explore contributing segments',
      'Show supporting evidence',
    ]);
    expect(actions[0]).toMatchObject({ question: 'Why is occupancy below target for 1–17 Nov 2026?', context: { intent: 'revenue_gap', origin: 'kpi' } });
    expect(actions[2]?.kind === 'ask' && actions[2].context).toMatchObject({ intent: 'data_question', breakdown: 'segment' });
  });

  it('splits Net RevPAR by channel and explains it with the channel analysis', () => {
    const actions = actionsForSelection({ ...occupancyKpi, metric: 'net_revpar', factId: 'net_revpar', label: 'Net RevPAR', actual: 98, reference: 110 }, everything);
    expect(actions.map((action) => action.label)).toContain('Explore contributing channels');
    expect(actions[0]?.kind === 'ask' && actions[0].context.intent).toBe('channel_cost');
  });

  it('only builds contexts the server accepts', () => {
    for (const selection of [congressNight, weakPaceNight, occupancyKpi]) {
      for (const action of actionsForSelection(selection, everything)) {
        if (action.kind === 'ask') expect(investigationContextSchema.safeParse(action.context).success).toBe(true);
      }
    }
  });
});

describe('the line above a question from a selection', () => {
  it('keeps what was selected readable after the chart is gone', () => {
    const [explainNight] = actionsForSelection(congressNight, everything);
    const [explainPace] = actionsForSelection(weakPaceNight, everything);
    const [whyKpi] = actionsForSelection(occupancyKpi, everything);
    expect(explainNight?.kind === 'ask' && describeInvestigationOrigin(explainNight.context)).toBe('From the chart · Wed 11 Nov · occupancy 37.8% vs 93.7% target');
    expect(explainPace?.kind === 'ask' && describeInvestigationOrigin(explainPace.context)).toBe(
      'From the chart · Tue 24 Nov · 49 room nights on the books vs 62 same point last year',
    );
    expect(whyKpi?.kind === 'ask' && describeInvestigationOrigin(whyKpi.context)).toBe('From the Occupancy card · 62.0% vs 75.0% target');
    expect(describeInvestigationOrigin({ origin: 'briefing', intent: 'booking_pace' })).toBe('From your morning briefing');
  });
});

describe('the investigation panel', () => {
  it('shows the figures, the actions (the first one leads) and the source', () => {
    const html = renderToStaticMarkup(
      <InvestigationPanel selection={congressNight} options={everything} source="Daily results, 1–17 Nov 2026" onAction={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain('Selected night');
    expect(html).toContain('93.7%');
    expect(html).toMatch(/primary-button[^"]*">Explain this drop/);
    expect(html).toContain('aria-label="Clear the selection"');
    expect(html).toContain('Daily results, 1–17 Nov 2026');
  });
});
