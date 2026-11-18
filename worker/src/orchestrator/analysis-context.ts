import { addDays, calendarMonthOf } from '@aurora/analytics';
import type {
  BookingPaceOutput,
  ChannelMixOutput,
  DateRange,
  Hotel,
  HotelOverviewOutput,
  IsoDate,
  RevenueDriversOutput,
} from '@aurora/shared';

/** The tool outputs collected during one run. A tool that was not called stays undefined. */
export interface ToolResults {
  overview?: HotelOverviewOutput;
  drivers?: RevenueDriversOutput;
  channelMix?: ChannelMixOutput;
  pace?: BookingPaceOutput;
}

/** Everything the narrative, KPI and provenance builders can read. */
export interface AnalysisContext {
  /** The user's question, as asked. */
  question: string;
  hotel: Hotel;
  /** The period being analysed (month to date). */
  period: DateRange;
  /** Future stay dates checked for pace. */
  paceWindow: DateRange;
  results: ToolResults;
}

/** 1st of the month to today. */
export function monthToDate(today: IsoDate): DateRange {
  return { from: calendarMonthOf(today).from, to: today };
}

/**
 * The last 10 nights of the month ("the rest of the month" in the demo: 21–30 Nov).
 * Near the month end, it switches to the next 10 nights.
 */
export function paceWindowFor(today: IsoDate): DateRange {
  const monthEnd = calendarMonthOf(today).to;
  const windowStart = addDays(monthEnd, -9);
  if (windowStart > today) return { from: windowStart, to: monthEnd };
  return { from: addDays(today, 1), to: addDays(today, 10) };
}
