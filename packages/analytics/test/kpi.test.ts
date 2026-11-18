import { describe, expect, it } from 'vitest';
import {
  calculateAdr,
  calculateNetRevpar,
  calculateOccupancy,
  calculatePickup,
  calculateRevpar,
  calculateRoomsAvailable,
  divideOrZero,
  summarizePerformance,
  sumRoomsAndRevenue,
} from '../src/kpi';
import { addDays, countNightsInRange, listDatesInRange } from '../src/dates';

// The design's demo numbers for Hotel Sablon, 1–17 Nov 2026:
// 111 rooms × 17 nights, 1,170 room nights sold, €208,260 room revenue.
const ROOM_COUNT = 111;
const NIGHTS = 17;
const ROOMS_SOLD = 1170;
const ROOM_REVENUE = 208_260;

describe('KPI formulas', () => {
  it('counts rooms available as rooms × nights', () => {
    expect(calculateRoomsAvailable(ROOM_COUNT, NIGHTS)).toBe(1887);
  });

  it('calculates occupancy = rooms sold / rooms available', () => {
    // 1170 / 1887 = 0.62003…
    expect(calculateOccupancy(ROOMS_SOLD, 1887)).toBeCloseTo(0.62003, 5);
  });

  it('calculates ADR = room revenue / rooms sold', () => {
    // 208260 / 1170 = 178.00 exactly
    expect(calculateAdr(ROOM_REVENUE, ROOMS_SOLD)).toBe(178);
  });

  it('calculates RevPAR = room revenue / rooms available, which equals occupancy × ADR', () => {
    const revpar = calculateRevpar(ROOM_REVENUE, 1887);
    // 208260 / 1887 = 110.3657…
    expect(revpar).toBeCloseTo(110.3657, 4);
    expect(revpar).toBeCloseTo(calculateOccupancy(ROOMS_SOLD, 1887) * calculateAdr(ROOM_REVENUE, ROOMS_SOLD), 10);
  });

  it('calculates Net RevPAR after commissions', () => {
    // (208260 − 22492) / 1887 = 185768 / 1887 = 98.4462…
    expect(calculateNetRevpar(ROOM_REVENUE, 22_492, 1887)).toBeCloseTo(98.4462, 4);
  });

  it('calculates pickup as the difference between two snapshots', () => {
    expect(calculatePickup(612, 574)).toBe(38);
  });

  it('returns 0 instead of NaN when there is nothing to divide by', () => {
    expect(divideOrZero(10, 0)).toBe(0);
    expect(calculateAdr(0, 0)).toBe(0);
    expect(calculateOccupancy(0, 0)).toBe(0);
  });

  it('summarizes a period from its rows', () => {
    const totals = sumRoomsAndRevenue([
      { roomsSold: 1000, roomRevenue: 180_000 },
      { roomsSold: 170, roomRevenue: 28_260 },
    ]);
    expect(totals).toEqual({ roomsSold: ROOMS_SOLD, roomRevenue: ROOM_REVENUE });

    const summary = summarizePerformance(totals, 1887);
    expect(summary.adr).toBe(178);
    expect(summary.occupancy).toBeCloseTo(0.62003, 5);
  });
});

describe('date helpers', () => {
  it('counts an inclusive range: 1–17 Nov is 17 nights', () => {
    expect(countNightsInRange({ from: '2026-11-01', to: '2026-11-17' })).toBe(17);
  });

  it('is not affected by the daylight-saving change at the end of October', () => {
    expect(countNightsInRange({ from: '2026-10-24', to: '2026-10-26' })).toBe(3);
    expect(listDatesInRange({ from: '2026-10-24', to: '2026-10-26' })).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('adds and subtracts days across month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});
