import { SEGMENTS } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { decomposeRevenueGap, type SegmentActualAndTarget } from '../src/variance';

describe('decomposeRevenueGap: a small example worked out by hand', () => {
  // Target: corporate 100 rooms × €200 = €20,000; leisure 100 rooms × €100 = €10,000.
  //         200 rooms, €30,000, ADR_t = €150.
  // Actual: corporate  60 rooms × €210 = €12,600; leisure 120 rooms × €105 = €12,600.
  //         180 rooms, €25,200, ADR_a = €140.
  const segments: SegmentActualAndTarget[] = [
    { segment: 'corporate', roomsSoldActual: 60, roomRevenueActual: 12_600, roomsSoldTarget: 100, roomRevenueTarget: 20_000 },
    { segment: 'leisure', roomsSoldActual: 120, roomRevenueActual: 12_600, roomsSoldTarget: 100, roomRevenueTarget: 10_000 },
  ];
  const variance = decomposeRevenueGap(segments);

  it('finds the gap: 25,200 − 30,000 = −4,800', () => {
    expect(variance.revenueGap).toBe(-4800);
    expect(variance.adrTarget).toBe(150);
    expect(variance.adrActual).toBe(140);
  });

  it('volume = (180 − 200) × 150 = −3,000', () => {
    expect(variance.volumeEffect).toBe(-3000);
  });

  it('price = (140 − 150) × 180 = −1,800', () => {
    expect(variance.priceEffect).toBe(-1800);
  });

  it('mix = (1/3 − 1/2) × 200 × 180 + (2/3 − 1/2) × 100 × 180 = −6,000 + 3,000 = −3,000', () => {
    // Corporate (the expensive segment) lost share, so the mix pulled the average rate down.
    expect(variance.mixEffect).toBeCloseTo(-3000, 9);
  });

  it('pure price = (210 − 200) × 60 + (105 − 100) × 120 = 600 + 600 = +1,200', () => {
    expect(variance.purePriceEffect).toBeCloseTo(1200, 9);
  });

  it('splits volume by segment: corporate (60 − 100) × 150 = −6,000, leisure (120 − 100) × 150 = +3,000', () => {
    const corporate = variance.segments.find((segment) => segment.segment === 'corporate');
    const leisure = variance.segments.find((segment) => segment.segment === 'leisure');
    expect(corporate?.volumeEffect).toBe(-6000);
    expect(leisure?.volumeEffect).toBe(3000);
  });

  it('closes the bridge: target + volume + mix + pure price = actual', () => {
    const bridgeEnd = variance.roomRevenueTarget + variance.volumeEffect + variance.mixEffect + variance.purePriceEffect;
    expect(bridgeEnd).toBeCloseTo(variance.roomRevenueActual, 9);
  });
});

describe('decomposeRevenueGap: the design demo totals', () => {
  // 1–17 Nov: 1,170 rooms for €208,260 against a target of 1,415 rooms for €242,177.
  const variance = decomposeRevenueGap([
    { segment: 'corporate', roomsSoldActual: 1170, roomRevenueActual: 208_260, roomsSoldTarget: 1415, roomRevenueTarget: 242_177 },
  ]);

  it('gives volume ≈ −€41,932 and price ≈ +€8,015, adding up to the −€33,917 gap', () => {
    expect(variance.revenueGap).toBe(-33_917);
    expect(Math.round(variance.volumeEffect)).toBe(-41_932);
    expect(Math.round(variance.priceEffect)).toBe(8015);
    expect(variance.volumeEffect + variance.priceEffect).toBeCloseTo(variance.revenueGap, 6);
  });
});

describe('decomposeRevenueGap: the identity holds on random data', () => {
  /** Small deterministic random generator (mulberry32), so the test is the same every run. */
  function createSeededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = createSeededRandom(20261117);
  const randomInteger = (min: number, max: number) => Math.floor(min + random() * (max - min + 1));

  it('volume + mix + pure price = gap, and segment parts add up, in 500 random cases', () => {
    for (let caseNumber = 0; caseNumber < 500; caseNumber += 1) {
      const segments: SegmentActualAndTarget[] = SEGMENTS.map((segment) => {
        // Sometimes a segment has no target or no sales at all, to cover the edge cases.
        const roomsSoldTarget = random() < 0.15 ? 0 : randomInteger(1, 800);
        const roomsSoldActual = random() < 0.15 ? 0 : randomInteger(1, 800);
        return {
          segment,
          roomsSoldTarget,
          roomRevenueTarget: roomsSoldTarget * randomInteger(60, 320),
          roomsSoldActual,
          roomRevenueActual: roomsSoldActual * randomInteger(60, 320),
        };
      });
      if (segments.every((segment) => segment.roomsSoldTarget === 0)) continue;

      const variance = decomposeRevenueGap(segments);
      const tolerance = 1e-6 * Math.max(1, Math.abs(variance.roomRevenueTarget));

      expect(Math.abs(variance.volumeEffect + variance.mixEffect + variance.purePriceEffect - variance.revenueGap)).toBeLessThan(tolerance);
      expect(Math.abs(variance.mixEffect + variance.purePriceEffect - variance.priceEffect)).toBeLessThan(tolerance);

      const segmentVolumeTotal = variance.segments.reduce((total, segment) => total + segment.volumeEffect, 0);
      expect(Math.abs(segmentVolumeTotal - variance.volumeEffect)).toBeLessThan(tolerance);
    }
  });
});
