import { dailyStatSchema, dailyTargetSchema, onTheBooksSchema } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { allocateByLargestRemainder, balanceIntegerMatrix } from '../src/allocate';
import { generateDemoDataset } from '../src/generate-demo-dataset';
import { DEMO_HOTEL } from '../src/story';

describe('allocateByLargestRemainder', () => {
  it('splits 10 into three equal weights as 4 + 3 + 3', () => {
    expect(allocateByLargestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it('always adds up to the total, and gives nothing to zero weights', () => {
    const allocation = allocateByLargestRemainder(1170, [68, 71, 0, 58, 61.5]);
    expect(allocation.reduce((total, part) => total + part, 0)).toBe(1170);
    expect(allocation[2]).toBe(0);
  });
});

describe('balanceIntegerMatrix', () => {
  it('matches both row and column totals with whole numbers', () => {
    const matrix = balanceIntegerMatrix([10, 7, 3], [12, 8], [
      [1, 1],
      [2, 1],
      [1, 3],
    ]);
    expect(matrix.map((row) => row[0]! + row[1]!)).toEqual([10, 7, 3]);
    expect([0, 1].map((column) => matrix.reduce((total, row) => total + row[column]!, 0))).toEqual([12, 8]);
    matrix.flat().forEach((cell) => expect(Number.isInteger(cell)).toBe(true));
  });

  it('refuses totals that do not match', () => {
    expect(() => balanceIntegerMatrix([5], [6], [[1]])).toThrow(/must be equal/);
  });
});

describe('generateDemoDataset', () => {
  const dataset = generateDemoDataset();

  it('is deterministic: two calls give identical data', () => {
    expect(generateDemoDataset()).toEqual(dataset);
  });

  it('only contains rows that pass the domain schemas', () => {
    dataset.dailyStats.forEach((row) => dailyStatSchema.parse(row));
    dataset.dailyTargets.forEach((row) => dailyTargetSchema.parse(row));
    dataset.onTheBooks.forEach((row) => onTheBooksSchema.parse(row));
  });

  it('never sells or budgets more rooms than the hotel has', () => {
    const roomsByDate = new Map<string, number>();
    dataset.dailyStats.forEach((row) => roomsByDate.set(row.date, (roomsByDate.get(row.date) ?? 0) + row.roomsSold));
    roomsByDate.forEach((rooms) => expect(rooms).toBeLessThanOrEqual(DEMO_HOTEL.roomCount));

    const targetByDate = new Map<string, number>();
    dataset.dailyTargets.forEach((row) => targetByDate.set(row.date, (targetByDate.get(row.date) ?? 0) + row.roomsTarget));
    targetByDate.forEach((rooms) => expect(rooms).toBeLessThanOrEqual(DEMO_HOTEL.roomCount));
  });

  it('never has negative rooms on the books in older snapshots', () => {
    dataset.onTheBooks.forEach((row) => expect(row.roomsOnTheBooks).toBeGreaterThanOrEqual(0));
  });

  it('records the cancelled congress: 68 cancelled MICE rooms on 10, 11 and 12 Nov 2026', () => {
    const congressRows = dataset.dailyStats.filter((row) => row.segment === 'mice' && row.cancellations === 68);
    expect(congressRows.map((row) => row.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });
});
