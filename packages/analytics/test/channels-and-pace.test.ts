import type { ChannelCommission } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { calculateChannelMix, calculateExtraCommissionFromMixShift } from '../src/channels';
import { compareBookingPace } from '../src/pace';

const COMMISSIONS: ChannelCommission[] = [
  { channel: 'direct', name: 'Direct (web)', commissionRate: 0 },
  { channel: 'ota', name: 'OTA', commissionRate: 0.18 },
  { channel: 'gds', name: 'GDS', commissionRate: 0.1 },
  { channel: 'wholesale', name: 'Wholesale', commissionRate: 0.2 },
];

describe('calculateChannelMix', () => {
  // Revenue: direct 1,000, OTA 2,000, GDS 500, wholesale 500 -> 4,000 in total.
  // Commission: 0 + 2,000 × 0.18 + 500 × 0.10 + 500 × 0.20 = 0 + 360 + 50 + 100 = 510.
  const mix = calculateChannelMix(
    [
      { channel: 'direct', roomRevenue: 1000 },
      { channel: 'ota', roomRevenue: 2000 },
      { channel: 'gds', roomRevenue: 500 },
      { channel: 'wholesale', roomRevenue: 500 },
    ],
    COMMISSIONS,
  );

  it('computes each channel share of revenue', () => {
    expect(mix.roomRevenue).toBe(4000);
    expect(mix.lines.map((line) => line.revenueShare)).toEqual([0.25, 0.5, 0.125, 0.125]);
  });

  it('computes commission cost: 510, which is 12.75% of revenue', () => {
    expect(mix.totalCommissionCost).toBeCloseTo(510, 9);
    expect(mix.commissionShareOfRevenue).toBeCloseTo(0.1275, 9);
  });

  it('prices the mix shift against last year: 510 − 4,000 × (0.35 × 0.18 + 0.14 × 0.10 + 0.06 × 0.20) = 510 − 356 = 154', () => {
    const extraCommission = calculateExtraCommissionFromMixShift(mix, { direct: 0.45, ota: 0.35, gds: 0.14, wholesale: 0.06 });
    expect(extraCommission).toBeCloseTo(154, 9);
  });

  it('refuses a channel without a configured commission', () => {
    expect(() => calculateChannelMix([{ channel: 'ota', roomRevenue: 100 }], [])).toThrow(/No commission rate/);
  });
});

describe('compareBookingPace', () => {
  it('compares rooms on the books with last year: 122 vs 146 is 24 behind, −16.4%', () => {
    const pace = compareBookingPace([
      { stayDate: '2026-11-21', roomsOnTheBooks: 58, roomsOnTheBooksLastYear: 70 },
      { stayDate: '2026-11-22', roomsOnTheBooks: 64, roomsOnTheBooksLastYear: 76 },
    ]);
    expect(pace.roomsOnTheBooks).toBe(122);
    expect(pace.roomsOnTheBooksLastYear).toBe(146);
    expect(pace.difference).toBe(-24);
    expect(pace.changeVsLastYear).toBeCloseTo(-24 / 146, 12);
  });

  it('design totals: 612 vs 731 is −16.3%', () => {
    const pace = compareBookingPace([{ stayDate: '2026-11-21', roomsOnTheBooks: 612, roomsOnTheBooksLastYear: 731 }]);
    expect(pace.changeVsLastYear).toBeCloseTo(-0.1628, 4);
  });
});
