const WEEKDAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function readDateParts(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/** "2026-11-10" -> "Tue 10 Nov" (dates are hotel-local, so they are read as UTC to avoid time-zone shifts). */
export function formatWeekdayDate(isoDate: string): string {
  const { month, day, weekday } = readDateParts(isoDate);
  return `${WEEKDAY_SHORT_NAMES[weekday]} ${day} ${MONTH_SHORT_NAMES[month - 1]}`;
}

/** "2026-11-10" -> 10 */
export function dayOfMonth(isoDate: string): number {
  return readDateParts(isoDate).day;
}
