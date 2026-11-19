import {
  formatCount,
  formatEuroCompact,
  formatPercent,
  formatPercentagePoints,
  type BriefingMeasure,
  type BriefingPriority,
  type BriefingSource,
} from '@aurora/shared';

// How the briefing is written on screen. The items and their numbers come from
// the server; this file only decides how they read.

export const PRIORITY_LABELS: Record<BriefingPriority, string> = {
  critical: 'Critical',
  important: 'Important',
  opportunity: 'Opportunity',
};

const SOURCE_LABELS: Record<BriefingSource, string> = {
  performance: 'daily results',
  revenue_drivers: 'revenue against budget',
  channels: 'channel mix',
  booking_pace: 'booking pace',
  group_blocks: 'group blocks',
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NUMBER_WORDS = ['no', 'one', 'two', 'three'];

/** By the viewer's clock: the briefing is read in the morning, but not only then. */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Here are the three things that deserve your attention today." */
export function describeItemCount(count: number): string {
  if (count === 1) return 'Here is the one thing that deserves your attention today.';
  return `Here are the ${NUMBER_WORDS[count] ?? count} things that deserve your attention today.`;
}

/** "2026-11-17" -> "Tuesday 17 November" (dates are hotel-local, read as UTC to avoid shifts). */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_NAMES[weekday]} ${day} ${MONTH_NAMES[month - 1]}`;
}

/** "2026-11-17" -> "17 Nov" */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTH_NAMES[month - 1]!.slice(0, 3)}`;
}

export function formatMeasureValue(unit: BriefingMeasure['unit'], value: number): string {
  if (unit === 'currency') return formatEuroCompact(value);
  if (unit === 'ratio') return formatPercent(value, { decimals: 0 });
  return formatCount(value);
}

/** "−16%" or "+13.0 pp": the figure against its baseline. */
export function formatMeasureDelta(measure: BriefingMeasure): string {
  if (measure.deltaStyle === 'percentage_points') return formatPercentagePoints(measure.value - measure.baseline);
  const change = measure.baseline === 0 ? 0 : measure.value / measure.baseline - 1;
  return formatPercent(change, { decimals: 0, signDisplay: 'always' });
}

/** "booking pace and channel mix" */
export function describeSources(sources: readonly BriefingSource[]): string {
  const labels = sources.map((source) => SOURCE_LABELS[source]);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}
