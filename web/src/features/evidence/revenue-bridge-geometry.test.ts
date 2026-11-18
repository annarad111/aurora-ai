import type { RevenueDriversOutput } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { buildRevenueBridge, toAxisPercent } from './revenue-bridge-geometry';

// The demo numbers: target €242,177, volume −€41,932, mix −€6,240, pure price +€14,255, actual €208,260.
const demoDrivers = {
  period: { from: '2026-11-01', to: '2026-11-17' },
  roomRevenueActual: 208_260,
  roomRevenueTarget: 242_177,
  revenueGap: -33_917,
  volumeEffect: -41_931.71,
  priceEffect: 8_014.71,
  mixEffect: -6_240.31,
  purePriceEffect: 14_255.02,
  segments: [],
  findings: [],
} satisfies RevenueDriversOutput;

describe('buildRevenueBridge', () => {
  const bridge = buildRevenueBridge(demoDrivers);

  it('starts the axis at €160k and ends at €250k, as in the design', () => {
    expect(bridge.axisMinimum).toBe(160_000);
    expect(bridge.axisMaximum).toBe(250_000);
  });

  it('walks from target to actual: each effect starts where the previous one ended', () => {
    const [target, volume, mix, price, actual] = bridge.bars;
    expect(volume?.topValue).toBe(target?.topValue);
    expect(mix?.topValue).toBeCloseTo(volume!.bottomValue, 6);
    expect(price?.bottomValue).toBeCloseTo(mix!.bottomValue, 6);
    expect(price?.topValue).toBeCloseTo(actual!.topValue, 6);
  });

  it('labels and colours the bars by sign', () => {
    expect(bridge.bars.map((bar) => `${bar.label} ${bar.valueLabel} ${bar.tone}`)).toEqual([
      'Target €242k total',
      'Volume −€41.9k negative',
      'Mix −€6.2k negative',
      'Price +€14.3k positive',
      'Actual €208k actual',
    ]);
  });

  it('places values on the axis as percentages', () => {
    expect(toAxisPercent(160_000, bridge)).toBe(0);
    expect(toAxisPercent(250_000, bridge)).toBe(100);
    expect(toAxisPercent(205_000, bridge)).toBe(50);
  });
});
