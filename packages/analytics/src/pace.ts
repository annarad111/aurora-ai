import type { IsoDate } from '@aurora/shared';
import { divideOrZero } from './kpi';

// ---------------------------------------------------------------------------
// Booking pace: rooms already on the books for future nights, compared with
// the same point in time last year. Behind pace means the gap will widen.
// ---------------------------------------------------------------------------

export interface StayDatePace {
  stayDate: IsoDate;
  roomsOnTheBooks: number;
  roomsOnTheBooksLastYear: number;
}

export interface BookingPaceComparison {
  roomsOnTheBooks: number;
  roomsOnTheBooksLastYear: number;
  /** Room nights ahead (+) or behind (−) last year. */
  difference: number;
  /** difference / last year: −0.163 means 16.3% behind. */
  changeVsLastYear: number;
}

export function compareBookingPace(stayDates: readonly StayDatePace[]): BookingPaceComparison {
  const roomsOnTheBooks = stayDates.reduce((total, day) => total + day.roomsOnTheBooks, 0);
  const roomsOnTheBooksLastYear = stayDates.reduce((total, day) => total + day.roomsOnTheBooksLastYear, 0);
  const difference = roomsOnTheBooks - roomsOnTheBooksLastYear;

  return {
    roomsOnTheBooks,
    roomsOnTheBooksLastYear,
    difference,
    changeVsLastYear: divideOrZero(difference, roomsOnTheBooksLastYear),
  };
}
