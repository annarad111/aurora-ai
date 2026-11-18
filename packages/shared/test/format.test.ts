import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatEuro,
  formatEuroCompact,
  formatPercent,
  formatPercentagePoints,
  formatPeriodLabel,
  MINUS_SIGN,
} from '../src/format';

describe('formatting matches the design', () => {
  it('uses the typographic minus sign, not a hyphen', () => {
    expect(MINUS_SIGN).toBe('−');
    expect(formatEuro(-1)).not.toContain('-');
  });

  it('formats euros', () => {
    expect(formatEuro(208_260)).toBe('€208,260');
    expect(formatEuro(-33_917.2)).toBe('−€33,917');
    expect(formatEuro(8014.7, { signDisplay: 'always' })).toBe('+€8,015');
    expect(formatEuro(171.1498, { decimals: 2 })).toBe('€171.15');
  });

  it('never shows "−0" after rounding', () => {
    expect(formatEuro(-0.004, { decimals: 2 })).toBe('€0.00');
    expect(formatPercent(-0.00001)).toBe('0.0%');
  });

  it('formats compact euros for chart labels', () => {
    expect(formatEuroCompact(242_177)).toBe('€242k');
    expect(formatEuroCompact(208_260)).toBe('€208k');
    expect(formatEuroCompact(-41_932)).toBe('−€41.9k');
    expect(formatEuroCompact(-6240)).toBe('−€6.2k');
    expect(formatEuroCompact(14_255, { signDisplay: 'always' })).toBe('+€14.3k');
  });

  it('formats ratios as percentages', () => {
    expect(formatPercent(0.62)).toBe('62.0%');
    expect(formatPercent(0.48, { decimals: 0 })).toBe('48%');
    expect(formatPercent(0.04, { signDisplay: 'always' })).toBe('+4.0%');
    expect(formatPercent(-0.14)).toBe('−14.0%');
  });

  it('formats percentage points, always with a sign', () => {
    expect(formatPercentagePoints(0.62 - 0.75)).toBe('−13.0 pp');
    expect(formatPercentagePoints(0.48 - 0.35, { decimals: 0 })).toBe('+13 pp');
  });

  it('formats period labels', () => {
    expect(formatPeriodLabel({ from: '2026-09-01', to: '2026-09-30' })).toBe('Sep 2026');
    expect(formatPeriodLabel({ from: '2026-11-01', to: '2026-11-17' })).toBe('1–17 Nov 2026');
    expect(formatPeriodLabel({ from: '2026-10-28', to: '2026-11-03' })).toBe('28 Oct – 3 Nov 2026');
    expect(formatPeriodLabel({ from: '2025-12-30', to: '2026-01-02' })).toBe('30 Dec 2025 – 2 Jan 2026');
  });

  it('formats counts', () => {
    expect(formatCount(1170)).toBe('1,170');
    expect(formatCount(-245)).toBe('−245');
    expect(formatCount(38, { signDisplay: 'always' })).toBe('+38');
  });
});
