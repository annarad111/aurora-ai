import { describe, expect, it } from 'vitest';
import { buildPaceFinding, buildRevenueFindings, rankFindingsByImpact } from '../src/findings';
import { calculatePerformanceVsReference, classifyMetricStatus } from '../src/status';
import { decomposeRevenueGap } from '../src/variance';

describe('classifyMetricStatus (higher is better)', () => {
  it('occupancy 62% vs 75% target is off track', () => {
    expect(calculatePerformanceVsReference('occupancy', 0.62, 0.75)).toBeCloseTo(-0.1733, 4);
    expect(classifyMetricStatus('occupancy', 0.62, 0.75)).toBe('off_track');
  });

  it('ADR €178 vs €171.15 is on track (better than target)', () => {
    expect(classifyMetricStatus('adr', 178, 171.15)).toBe('on_track');
  });

  it('ADR 1.8% below target is still on track (within the 2% tolerance)', () => {
    expect(classifyMetricStatus('adr', 168, 171.15)).toBe('on_track');
  });

  it('ADR 3.6% below target is "watch" (between 2% and 5%)', () => {
    expect(classifyMetricStatus('adr', 165, 171.15)).toBe('watch');
  });

  it('booking pace 16% behind last year is "watch", because pace only goes off track beyond 20%', () => {
    expect(classifyMetricStatus('booking_pace', 612, 731)).toBe('watch');
    expect(classifyMetricStatus('booking_pace', 500, 731)).toBe('off_track');
  });
});

describe('classifyMetricStatus (lower is better)', () => {
  it('a rising cancellation rate is bad news, not good news', () => {
    // 0.11 vs 0.10 is 10% worse -> watch; 0.12 vs 0.10 is 20% worse -> off track.
    expect(calculatePerformanceVsReference('cancellation_rate', 0.11, 0.1)).toBeCloseTo(-0.1, 9);
    expect(classifyMetricStatus('cancellation_rate', 0.11, 0.1)).toBe('watch');
    expect(classifyMetricStatus('cancellation_rate', 0.12, 0.1)).toBe('off_track');
    expect(classifyMetricStatus('cancellation_rate', 0.08, 0.1)).toBe('on_track');
  });

  it('OTA share up from 35% to 48% is off track', () => {
    expect(classifyMetricStatus('ota_share', 0.48, 0.35)).toBe('off_track');
  });
});

it('a metric without a reference is on track by default', () => {
  expect(classifyMetricStatus('revpar', 110, null)).toBe('on_track');
});

describe('findings', () => {
  const variance = decomposeRevenueGap([
    { segment: 'corporate', roomsSoldActual: 60, roomRevenueActual: 12_600, roomsSoldTarget: 100, roomRevenueTarget: 20_000 },
    { segment: 'leisure', roomsSoldActual: 120, roomRevenueActual: 12_600, roomsSoldTarget: 100, roomRevenueTarget: 10_000 },
    { segment: 'group', roomsSoldActual: 0, roomRevenueActual: 0, roomsSoldTarget: 0, roomRevenueTarget: 0 },
    { segment: 'mice', roomsSoldActual: 0, roomRevenueActual: 0, roomsSoldTarget: 0, roomRevenueTarget: 0 },
  ]);
  const findings = buildRevenueFindings(variance);

  it('creates one finding per driver and one per segment volume', () => {
    expect(findings.map((finding) => finding.id).sort()).toEqual(
      ['mix', 'pure_price', 'revenue_gap', 'volume', 'volume_corporate', 'volume_group', 'volume_leisure', 'volume_mice'].sort(),
    );
  });

  it('ranks findings by absolute euro impact, biggest first', () => {
    // corporate volume −6,000, revenue gap −4,800, then −3,000 (volume, mix), +3,000 (leisure volume), +1,200 (pure price)
    expect(findings[0]?.id).toBe('volume_corporate');
    expect(findings[1]?.id).toBe('revenue_gap');
    const impacts = findings.map((finding) => Math.abs(finding.impactEur));
    expect(impacts).toEqual([...impacts].sort((first, second) => second - first));
  });

  it('values the pace shortfall at the reference ADR: −119 rooms × €171.15', () => {
    const paceFinding = buildPaceFinding(
      { roomsOnTheBooks: 612, roomsOnTheBooksLastYear: 731, difference: -119, changeVsLastYear: -119 / 731 },
      171.15,
    );
    expect(paceFinding.impactEur).toBeCloseTo(-20_366.85, 6);
  });

  it('rankFindingsByImpact does not change the original list', () => {
    const original = [...findings].reverse();
    const copy = [...original];
    rankFindingsByImpact(original);
    expect(original).toEqual(copy);
  });
});
