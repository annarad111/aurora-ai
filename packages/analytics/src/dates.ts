import type { DateRange, IsoDate } from '@aurora/shared';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parses "YYYY-MM-DD" as midnight UTC, so daylight-saving changes never shift a day. */
function isoDateToUtcMilliseconds(isoDate: IsoDate): number {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function utcMillisecondsToIsoDate(utcMilliseconds: number): IsoDate {
  return new Date(utcMilliseconds).toISOString().slice(0, 10);
}

/** Number of nights in an inclusive range: 1–17 Nov is 17 nights. */
export function countNightsInRange(range: DateRange): number {
  const dayDifference = (isoDateToUtcMilliseconds(range.to) - isoDateToUtcMilliseconds(range.from)) / MILLISECONDS_PER_DAY;
  return dayDifference + 1;
}

/** Every date of an inclusive range, in order. */
export function listDatesInRange(range: DateRange): IsoDate[] {
  const dates: IsoDate[] = [];
  const lastDay = isoDateToUtcMilliseconds(range.to);
  for (let currentDay = isoDateToUtcMilliseconds(range.from); currentDay <= lastDay; currentDay += MILLISECONDS_PER_DAY) {
    dates.push(utcMillisecondsToIsoDate(currentDay));
  }
  return dates;
}

/** Moves a date by a number of days (negative goes back). */
export function addDays(isoDate: IsoDate, dayCount: number): IsoDate {
  return utcMillisecondsToIsoDate(isoDateToUtcMilliseconds(isoDate) + dayCount * MILLISECONDS_PER_DAY);
}

/**
 * Same calendar date in another year: 2026-11-10 -> 2025-11-10.
 * 29 February becomes 28 February when the target year has no leap day.
 */
export function shiftDateByYears(isoDate: IsoDate, yearCount: number): IsoDate {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const targetYear = year + yearCount;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDayOfTargetMonth);
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function shiftRangeByYears(range: DateRange, yearCount: number): DateRange {
  return { from: shiftDateByYears(range.from, yearCount), to: shiftDateByYears(range.to, yearCount) };
}

/** Day of the week, 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(isoDate: IsoDate): number {
  return new Date(isoDateToUtcMilliseconds(isoDate)).getUTCDay();
}

/** The full calendar month that contains the date: 2026-11-17 -> 2026-11-01 … 2026-11-30. */
export function calendarMonthOf(isoDate: IsoDate): DateRange {
  const [year, month] = isoDate.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  return { from: `${monthPrefix}-01`, to: `${monthPrefix}-${String(lastDay).padStart(2, '0')}` };
}

export function isDateInRange(isoDate: IsoDate, range: DateRange): boolean {
  return isoDate >= range.from && isoDate <= range.to;
}
