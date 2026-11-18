import { addDays, classifyMetricStatus, compareBookingPace, listDatesInRange, shiftDateByYears, shiftRangeByYears } from '@aurora/analytics';
import type { BookingPaceInput, BookingPaceOutput, OnTheBooks } from '@aurora/shared';
import { requireHotel, ToolInputError, type ToolContext } from './tool-context';

const PICKUP_WINDOW_DAYS = 7;

function totalRooms(rows: readonly OnTheBooks[]): number {
  return rows.reduce((total, row) => total + row.roomsOnTheBooks, 0);
}

/**
 * get_booking_pace: rooms on the books today for future stay dates, compared
 * with the same point last year, plus the pickup of the last 7 days.
 */
export async function getBookingPace(input: BookingPaceInput, context: ToolContext): Promise<BookingPaceOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  if (input.stayFrom > input.stayTo) {
    throw new ToolInputError('invalid_input', 'stayFrom must not be after stayTo');
  }

  const stayPeriod = { from: input.stayFrom, to: input.stayTo };
  const lastYearStayPeriod = shiftRangeByYears(stayPeriod, -1);
  const snapshotDate = context.today;
  const lastYearSnapshotDate = shiftDateByYears(snapshotDate, -1);
  const { repository } = context;

  const [onTheBooksToday, onTheBooksWeekAgo, onTheBooksLastYear, onTheBooksLastYearWeekAgo] = await Promise.all([
    repository.listOnTheBooks(hotel.id, snapshotDate, stayPeriod),
    repository.listOnTheBooks(hotel.id, addDays(snapshotDate, -PICKUP_WINDOW_DAYS), stayPeriod),
    repository.listOnTheBooks(hotel.id, lastYearSnapshotDate, lastYearStayPeriod),
    repository.listOnTheBooks(hotel.id, addDays(lastYearSnapshotDate, -PICKUP_WINDOW_DAYS), lastYearStayPeriod),
  ]);

  const stayDates = listDatesInRange(stayPeriod).map((stayDate) => {
    const lastYearStayDate = shiftDateByYears(stayDate, -1);
    return {
      stayDate,
      roomsOnTheBooks: onTheBooksToday.find((row) => row.stayDate === stayDate)?.roomsOnTheBooks ?? 0,
      roomsOnTheBooksLastYear: onTheBooksLastYear.find((row) => row.stayDate === lastYearStayDate)?.roomsOnTheBooks ?? 0,
    };
  });
  const pace = compareBookingPace(stayDates);

  return {
    stayFrom: input.stayFrom,
    stayTo: input.stayTo,
    snapshotDate,
    roomsOnTheBooks: pace.roomsOnTheBooks,
    roomsOnTheBooksLastYear: pace.roomsOnTheBooksLastYear,
    changeVsLastYear: pace.changeVsLastYear,
    pickupLast7Days: totalRooms(onTheBooksToday) - totalRooms(onTheBooksWeekAgo),
    pickupLast7DaysLastYear: totalRooms(onTheBooksLastYear) - totalRooms(onTheBooksLastYearWeekAgo),
    status: classifyMetricStatus('booking_pace', pace.roomsOnTheBooks, pace.roomsOnTheBooksLastYear),
    stayDates,
  };
}
