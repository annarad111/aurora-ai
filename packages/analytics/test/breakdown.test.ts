import type { ChannelCommission, DailyStat } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { breakDownPerformance, dayTypeOf, listCoveredNights } from '../src/breakdown';

// A 10-room hotel over three nights: Thu 5, Fri 6 and Sat 7 November 2026.
const COMMISSIONS: ChannelCommission[] = [
  { channel: 'direct', name: 'Direct', commissionRate: 0 },
  { channel: 'ota', name: 'OTA', commissionRate: 0.2 },
  { channel: 'gds', name: 'GDS', commissionRate: 0.1 },
  { channel: 'wholesale', name: 'Wholesale', commissionRate: 0.25 },
];

function stat(date: string, segment: DailyStat['segment'], channel: DailyStat['channel'], roomsSold: number, roomRevenue: number): DailyStat {
  return { hotelId: 'test', date, segment, channel, roomsSold, roomRevenue, cancellations: 0 };
}

const STATS: DailyStat[] = [
  stat('2026-11-05', 'corporate', 'direct', 6, 1200), // Thursday: 6 rooms, €1,200
  stat('2026-11-06', 'leisure', 'ota', 8, 1200), //      Friday:   8 rooms, €1,200, commission €240
  stat('2026-11-07', 'leisure', 'ota', 10, 2000), //     Saturday: 10 rooms, €2,000, commission €400
];
const PERIOD = { from: '2026-11-05', to: '2026-11-07' };
const breakdown = (dimension: Parameters<typeof breakDownPerformance>[1]['dimension'], dayType?: 'weekend' | 'weekday') =>
  breakDownPerformance(STATS, { period: PERIOD, roomCount: 10, dimension, commissions: COMMISSIONS, dayType });

describe('breakDownPerformance', () => {
  it('in total: 24 of 30 rooms = 80%, ADR 4,400 / 24 = €183.33, Net RevPAR (4,400 − 640) / 30 = €125.33', () => {
    const [total] = breakdown('none');
    expect(total).toMatchObject({ key: 'total', nights: 3, roomsAvailable: 30, roomsSold: 24, roomRevenue: 4400, commissionCost: 640 });
    expect(total?.occupancy).toBeCloseTo(0.8, 9);
    expect(total?.adr).toBeCloseTo(183.333, 3);
    expect(total?.netRevpar).toBeCloseTo(125.333, 3);
  });

  it('weekend vs weekday: Fri + Sat = 18 of 20 rooms at €177.78; Thu = 6 of 10 at €200', () => {
    const [weekend, weekday] = breakdown('day_type');
    expect(weekend).toMatchObject({ key: 'weekend', nights: 2, roomsAvailable: 20, roomsSold: 18, roomRevenue: 3200 });
    expect(weekend?.adr).toBeCloseTo(177.778, 3);
    expect(weekday).toMatchObject({ key: 'weekday', nights: 1, roomsAvailable: 10, roomsSold: 6, roomRevenue: 1200 });
    expect(weekday?.adr).toBe(200);
  });

  it('by segment: each segment is a share of the whole hotel, so the occupancies add up', () => {
    const rows = breakdown('segment');
    expect(rows.map((row) => row.key)).toEqual(['corporate', 'leisure', 'group', 'mice']);
    expect(rows.reduce((total, row) => total + row.occupancy, 0)).toBeCloseTo(0.8, 9);
  });

  it('by night: one row per night, even a night with no sales', () => {
    const rows = breakDownPerformance(STATS, { period: { from: '2026-11-05', to: '2026-11-08' }, roomCount: 10, dimension: 'day', commissions: COMMISSIONS });
    expect(rows.map((row) => `${row.key}:${row.roomsSold}`)).toEqual(['2026-11-05:6', '2026-11-06:8', '2026-11-07:10', '2026-11-08:0']);
  });

  it('weekend filter with a channel split: only Fri + Sat, all on OTA', () => {
    const rows = breakdown('channel', 'weekend');
    expect(rows.find((row) => row.key === 'ota')).toMatchObject({ roomsSold: 18, roomRevenue: 3200, commissionCost: 640, roomsAvailable: 20 });
    expect(rows.find((row) => row.key === 'direct')?.roomsSold).toBe(0);
  });

  it('by weekday: Monday-first order, only weekdays in the period', () => {
    expect(breakdown('weekday').map((row) => row.label)).toEqual(['Thursday', 'Friday', 'Saturday']);
  });
});

describe('day types', () => {
  it('Friday and Saturday nights are the weekend', () => {
    expect(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map(dayTypeOf)).toEqual(['weekday', 'weekend', 'weekend', 'weekday']);
    expect(listCoveredNights({ from: '2026-11-01', to: '2026-11-08' }, 'weekend')).toEqual(['2026-11-06', '2026-11-07']);
  });
});
