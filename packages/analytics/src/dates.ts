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

export function isDateInRange(isoDate: IsoDate, range: DateRange): boolean {
  return isoDate >= range.from && isoDate <= range.to;
}
