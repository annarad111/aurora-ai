import { CHANNELS, SEGMENTS } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { generateDemoDataset } from '../src/generate-demo-dataset';
import { DEMO_HOTEL, DEMO_TODAY } from '../src/story';

// ---------------------------------------------------------------------------
// The demo must be believable to a hotel professional: every figure on screen
// comes from this dataset, so nothing in it may be physically impossible or
// commercially absurd. These checks run on every change to the data.
// ---------------------------------------------------------------------------

const dataset = generateDemoDataset();
const ROOMS = DEMO_HOTEL.roomCount;

function totalsByNight() {
  const nights = new Map<string, { sold: number; revenue: number; cancellations: number }>();
  for (const row of dataset.dailyStats) {
    const night = nights.get(row.date) ?? { sold: 0, revenue: 0, cancellations: 0 };
    night.sold += row.roomsSold;
    night.revenue += row.roomRevenue;
    night.cancellations += row.cancellations;
    nights.set(row.date, night);
  }
  return nights;
}

describe('the demo results are possible', () => {
  const nights = totalsByNight();

  it('never sell more rooms than the hotel has, this year or last year', () => {
    for (const [date, night] of nights) expect(night.sold, date).toBeLessThanOrEqual(ROOMS);
  });

  it('have no negative rooms, revenue or cancellations, and revenue only where rooms were sold', () => {
    for (const row of dataset.dailyStats) {
      expect(row.roomsSold).toBeGreaterThanOrEqual(0);
      expect(row.roomRevenue).toBeGreaterThanOrEqual(0);
      expect(row.cancellations).toBeGreaterThanOrEqual(0);
      if (row.roomsSold === 0) expect(row.roomRevenue).toBe(0);
    }
  });

  it('keep the average rate of an upscale Brussels city hotel (€100–€300 a night)', () => {
    for (const [date, night] of nights) {
      const averageRate = night.revenue / night.sold;
      expect(averageRate, date).toBeGreaterThan(100);
      expect(averageRate, date).toBeLessThan(300);
    }
  });

  it('only use known segments and channels', () => {
    for (const row of dataset.dailyStats) {
      expect(SEGMENTS).toContain(row.segment);
      expect(CHANNELS).toContain(row.channel);
    }
  });

  it('cover every night from the start of the history to today, this year and last year', () => {
    expect(nights.has(DEMO_TODAY)).toBe(true);
    expect(nights.has('2026-08-01')).toBe(true);
    expect(nights.has('2025-08-01')).toBe(true);
    expect([...nights.keys()].some((date) => date > DEMO_TODAY)).toBe(false);
  });
});

describe('the demo budget and bookings are possible', () => {
  it('never budget more rooms than the hotel has, at a believable rate', () => {
    const targets = new Map<string, { rooms: number; revenue: number }>();
    for (const row of dataset.dailyTargets) {
      const night = targets.get(row.date) ?? { rooms: 0, revenue: 0 };
      night.rooms += row.roomsTarget;
      night.revenue += row.roomRevenueTarget;
      targets.set(row.date, night);
    }
    for (const [date, night] of targets) {
      expect(night.rooms, date).toBeLessThanOrEqual(ROOMS);
      expect(night.revenue / night.rooms, date).toBeGreaterThan(100);
      expect(night.revenue / night.rooms, date).toBeLessThan(300);
    }
  });

  it('never have more rooms on the books than the hotel has, and only for future nights', () => {
    const booked = new Map<string, number>();
    for (const row of dataset.onTheBooks) {
      expect(row.stayDate > row.snapshotDate, `${row.snapshotDate} → ${row.stayDate}`).toBe(true);
      booked.set(`${row.snapshotDate}|${row.stayDate}`, (booked.get(`${row.snapshotDate}|${row.stayDate}`) ?? 0) + row.roomsOnTheBooks);
    }
    for (const [key, rooms] of booked) expect(rooms, key).toBeLessThanOrEqual(ROOMS);
  });

  it('only fill a night with bookings as it gets closer (a later snapshot never has fewer rooms)', () => {
    const snapshots = [...new Set(dataset.onTheBooks.map((row) => row.snapshotDate))].sort();
    const roomsFor = (snapshot: string, stay: string) =>
      dataset.onTheBooks.filter((row) => row.snapshotDate === snapshot && row.stayDate === stay).reduce((sum, row) => sum + row.roomsOnTheBooks, 0);
    const stays = [...new Set(dataset.onTheBooks.map((row) => row.stayDate))];
    for (const stay of stays) {
      const series = snapshots.filter((snapshot) => snapshot < stay && snapshot.slice(0, 4) === stay.slice(0, 4)).map((snapshot) => roomsFor(snapshot, stay));
      for (let index = 1; index < series.length; index += 1) {
        if (series[index - 1]! > 0 && series[index]! > 0) expect(series[index]!, stay).toBeGreaterThanOrEqual(series[index - 1]!);
      }
    }
  });
});

describe('the demo group blocks are possible', () => {
  it('fit inside the hotel, and a confirmed past block was actually sold in its segment', () => {
    for (const block of dataset.groupBlocks) {
      expect(block.roomsPerNight).toBeLessThanOrEqual(ROOMS);
      expect(block.firstNight <= block.lastNight).toBe(true);
      if (block.status === 'cancelled') expect(block.cancelledOn! <= block.firstNight).toBe(true);
      if (block.status === 'confirmed' && block.lastNight <= DEMO_TODAY) {
        for (const row of [block.firstNight, block.lastNight]) {
          const soldInSegment = dataset.dailyStats.filter((stat) => stat.date === row && stat.segment === block.segment).reduce((sum, stat) => sum + stat.roomsSold, 0);
          expect(soldInSegment, `${block.name} on ${row}`).toBeGreaterThanOrEqual(block.roomsPerNight);
        }
      }
    }
  });

  it('show the cancelled congress as cancellations on its nights', () => {
    const congress = dataset.groupBlocks.find((block) => block.status === 'cancelled')!;
    const cancelled = dataset.dailyStats.filter((row) => row.date === congress.firstNight).reduce((sum, row) => sum + row.cancellations, 0);
    expect(cancelled).toBeGreaterThanOrEqual(congress.roomsPerNight);
  });
});

describe('the demo rooms follow hotel numbering', () => {
  it('are numbered by floor: the first digit is the floor, the last two the room on that floor', () => {
    for (const room of dataset.rooms) {
      expect(room.roomNumber).toMatch(/^\d{3}$/);
      expect(Number(room.roomNumber[0])).toBe(room.floor);
      expect(Number(room.roomNumber.slice(1))).toBeGreaterThanOrEqual(1);
    }
    expect(Math.max(...dataset.rooms.map((room) => room.floor))).toBe(6);
  });
});
