import { describe, expect, it } from 'vitest';
import { planInsightRun } from '../src/orchestrator/insight-plan';
import { parseDataQuestion, parsePeriod } from '../src/orchestrator/question-parser';

const TODAY = '2026-11-17';

describe('parsePeriod', () => {
  it.each([
    ['What was occupancy on 5 November?', { from: '2026-11-05', to: '2026-11-05' }],
    ['ADR on Nov 3rd', { from: '2026-11-03', to: '2026-11-03' }],
    ['Revenue for 1–17 Nov 2026', { from: '2026-11-01', to: '2026-11-17' }],
    ['Revenue in October', { from: '2026-10-01', to: '2026-10-31' }],
    ['How was last week?', { from: '2026-11-11', to: '2026-11-17' }],
    ['Show last month', { from: '2026-10-01', to: '2026-10-31' }],
    ['Occupancy yesterday', { from: '2026-11-16', to: '2026-11-16' }],
    ['Revenue in December 2025', { from: '2025-12-01', to: '2025-12-31' }],
  ])('"%s"', (question, expected) => {
    expect(parsePeriod(question, TODAY)).toEqual(expected);
  });

  it.each([
    ['Are we on pace for the last 10 days of November?', { from: '2026-11-21', to: '2026-11-30' }],
    ['How do the final 5 nights of the month look?', { from: '2026-11-26', to: '2026-11-30' }],
    ['Pace for the first week of December', { from: '2026-12-01', to: '2026-12-07' }],
    ['What is on the books for the rest of the month?', { from: '2026-11-18', to: '2026-11-30' }],
  ])('part of a month: "%s"', (question, expected) => {
    expect(parsePeriod(question, TODAY)).toEqual(expected);
  });

  it('a month that has not started yet stays in the future (for pace)', () => {
    expect(parsePeriod('Where should rates move for 21–30 November?', TODAY)).toEqual({ from: '2026-11-21', to: '2026-11-30' });
  });
});

describe('parseDataQuestion', () => {
  it('weekend ADR by channel: split by channel, weekend nights only, ADR first', () => {
    expect(parseDataQuestion('What was ADR on weekends by channel?', TODAY)).toMatchObject({
      query: { groupBy: 'channel', dayType: 'weekend', period: { from: '2026-11-01', to: '2026-11-17' } },
      primaryMetric: 'adr',
    });
  });

  it('weekend vs weekday becomes a split, not a filter', () => {
    expect(parseDataQuestion('Compare weekday and weekend occupancy', TODAY)?.query).toMatchObject({ groupBy: 'day_type' });
  });

  it('a filter word without its own split: corporate revenue by night in October', () => {
    expect(parseDataQuestion('Corporate revenue by night in October', TODAY)?.query).toMatchObject({
      groupBy: 'day',
      segments: ['corporate'],
      period: { from: '2026-10-01', to: '2026-10-31' },
    });
  });

  it('"moved most vs last year" ranks rows by their change', () => {
    expect(parseDataQuestion('Which segment moved most vs last year?', TODAY)).toMatchObject({
      query: { groupBy: 'segment', compareWithLastYear: true },
      rankBy: 'change',
    });
  });

  it('"this month" alone is not enough to make a data question', () => {
    expect(parseDataQuestion('What are OTA commissions costing us this month?', TODAY)).toBeNull();
  });
});

describe('planInsightRun: which route each question takes', () => {
  it.each([
    ['Why is my hotel revenue below target this month?', 'revenue_gap'],
    ['What are OTA commissions costing us this month?', 'channel_cost'],
    ['Are we on pace for the last 10 days of November?', 'booking_pace'],
    ['Where should rates move for 21–30 November?', 'booking_pace'],
    ['Which segments replaced the lost MICE nights?', 'segment_shift'],
    ['Break the volume effect down by segment', 'segment_shift'],
    ['Are other group blocks at risk this quarter?', 'group_blocks'],
    ['What was occupancy on 5 November?', 'data_question'],
    ['Show Net RevPAR by channel', 'data_question'],
    ['Compare weekday and weekend occupancy', 'data_question'],
    ['Which segment moved most vs last year?', 'data_question'],
  ])('"%s" → %s', (question, intent) => {
    expect(planInsightRun(question, TODAY).intent).toBe(intent);
  });

  it('a future period asked as a rate question checks pace for those nights', () => {
    expect(planInsightRun('Where should rates move for 21–30 November?', TODAY).paceWindowOverride).toEqual({ from: '2026-11-21', to: '2026-11-30' });
  });

  it('a gap question about another month analyses that month', () => {
    expect(planInsightRun('Why was revenue below target in October?', TODAY).periodOverride).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('the group block question covers the quarter', () => {
    expect(planInsightRun('Are other group blocks at risk this quarter?', TODAY).steps[0]?.input).toEqual({ period: { from: '2026-10-01', to: '2026-12-31' } });
  });
});

describe('follow-ups keep the selection', () => {
  it('a follow-up written for a weekend question parses back to weekend nights', () => {
    expect(parseDataQuestion('Show ADR by segment for 1–17 Nov 2026 on weekend nights', TODAY)?.query).toMatchObject({
      groupBy: 'segment',
      dayType: 'weekend',
      period: { from: '2026-11-01', to: '2026-11-17' },
    });
  });

  it('"OTA only" becomes a channel filter', () => {
    expect(parseDataQuestion('Show occupancy by segment for 1–17 Nov 2026, OTA only', TODAY)?.query).toMatchObject({ groupBy: 'segment', channels: ['ota'] });
  });
});
