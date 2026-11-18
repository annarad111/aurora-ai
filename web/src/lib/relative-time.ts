const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday" or "12 Nov", for when a question was asked (in the viewer's own time zone). */
export function describeWhenAsked(askedAt: string, now: Date = new Date()): string {
  const asked = new Date(askedAt);
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(asked)) / (24 * 60 * 60 * 1000));
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return `${asked.getDate()} ${MONTH_SHORT_NAMES[asked.getMonth()]}`;
}
