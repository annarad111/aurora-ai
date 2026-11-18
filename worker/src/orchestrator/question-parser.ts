import { addDays, calendarMonthOf } from '@aurora/analytics';
import {
  CHANNELS,
  SEGMENTS,
  type BreakdownDimension,
  type BreakdownMetric,
  type Channel,
  type DateRange,
  type DayType,
  type IsoDate,
  type QueryPerformanceInput,
  type Segment,
} from '@aurora/shared';

// ---------------------------------------------------------------------------
// Understanding a free-form data question without a language model.
//
// It recognises periods ("5 November", "1–17 Nov 2026", "last week", "in
// October"), splits ("by channel", "weekend vs weekday", "each night"),
// metrics ("ADR", "occupancy"), filters ("OTA", "corporate") and "vs last
// year". With the model on, the model fills the same query itself and this
// parser is the fallback; without it, this is how the chat understands data questions.
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_PATTERN = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function monthNumberOf(monthText: string): number {
  return MONTH_NAMES.findIndex((name) => name.startsWith(monthText.toLowerCase().slice(0, 3))) + 1;
}

function isoDate(year: number, month: number, day: number): IsoDate {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Without a year, a date means its latest occurrence that is not in the far future (this year, or last year). */
function inferYear(month: number, day: number, explicitYear: string | undefined, today: IsoDate): number {
  if (explicitYear) return Number(explicitYear);
  const thisYear = Number(today.slice(0, 4));
  // A date up to two months ahead stays in this year (questions about the coming weeks).
  return isoDate(thisYear, month, day) <= addDays(today, 62) ? thisYear : thisYear - 1;
}

/** The period the question is about, or null when it names none (the caller then uses month to date). */
export function parsePeriod(question: string, today: IsoDate): DateRange | null {
  const text = question.toLowerCase();

  const dayRange = new RegExp(`\\b(\\d{1,2})\\s*[–-]\\s*(\\d{1,2})\\s+${MONTH_PATTERN}(?:\\s+(\\d{4}))?`).exec(text);
  if (dayRange) {
    const month = monthNumberOf(dayRange[3]!);
    const year = inferYear(month, Number(dayRange[1]), dayRange[4], today);
    return { from: isoDate(year, month, Number(dayRange[1])), to: isoDate(year, month, Number(dayRange[2])) };
  }

  const dayThenMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_PATTERN}(?:\\s+(\\d{4}))?\\b`).exec(text);
  const monthThenDay = new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`).exec(text);
  if (dayThenMonth || monthThenDay) {
    const [day, monthText, yearText] = dayThenMonth
      ? [Number(dayThenMonth[1]), dayThenMonth[2]!, dayThenMonth[3]]
      : [Number(monthThenDay![2]), monthThenDay![1]!, monthThenDay![3]];
    const month = monthNumberOf(monthText);
    const date = isoDate(inferYear(month, day, yearText, today), month, day);
    return { from: date, to: date };
  }

  if (/\byesterday\b/.test(text)) return { from: addDays(today, -1), to: addDays(today, -1) };
  if (/\btoday\b|\btonight\b/.test(text)) return { from: today, to: today };
  if (/\b(last|past) (week|7 days)\b/.test(text)) return { from: addDays(today, -6), to: today };
  if (/\b(last|past) 30 days\b/.test(text)) return { from: addDays(today, -29), to: today };
  if (/\b(last|previous) month\b/.test(text)) return calendarMonthOf(addDays(calendarMonthOf(today).from, -1));
  if (/\b(this month|month to date|so far)\b/.test(text)) return { from: calendarMonthOf(today).from, to: today };

  const monthOnly = new RegExp(`\\b${MONTH_PATTERN}\\b(?:\\s+(\\d{4}))?`).exec(text);
  if (monthOnly) {
    const month = monthNumberOf(monthOnly[1]!);
    const year = inferYear(month, 1, monthOnly[2], today);
    const wholeMonth = calendarMonthOf(isoDate(year, month, 1));
    return wholeMonth.from > today ? wholeMonth : { from: wholeMonth.from, to: wholeMonth.to < today ? wholeMonth.to : today };
  }
  return null;
}

/** "by channel", "each night", "weekend vs weekday"… A lone "weekend" is a filter, unless it is compared with weekdays. */
export function parseSplit(question: string): { groupBy: BreakdownDimension | null; dayType: DayType | null } {
  const text = question.toLowerCase();
  const mentionsWeekend = /\bweekends?\b/.test(text);
  const mentionsWeekday = /\bweekdays?\b|\bweek ?nights?\b/.test(text);

  let groupBy: BreakdownDimension | null = null;
  if (/\b(by|per|each|every|across|which)\s+(channels?|distribution)\b|\bchannels?\b.*\b(compare|split|breakdown)\b/.test(text) || /\bby channel\b/.test(text)) groupBy = 'channel';
  else if (/\b(by|per|each|every|across|which)\s+segments?\b|\bsegments?\b/.test(text)) groupBy = 'segment';
  else if (/\b(day of (the )?week|by weekday|per weekday)\b/.test(text)) groupBy = 'weekday';
  else if (/\b(daily|by day|per day|each day|every day|by night|per night|each night|night by night|which (dates|days|nights))\b/.test(text)) groupBy = 'day';

  if (mentionsWeekend && mentionsWeekday) return { groupBy: groupBy ?? 'day_type', dayType: null };
  if (mentionsWeekend) return { groupBy, dayType: 'weekend' };
  if (mentionsWeekday && !/\bday of (the )?week\b/.test(text)) return { groupBy, dayType: 'weekday' };
  return { groupBy, dayType: null };
}

export function parseMetric(question: string): BreakdownMetric | null {
  const text = question.toLowerCase();
  if (/\bnet revpar\b/.test(text)) return 'net_revpar';
  if (/\brevpar\b/.test(text)) return 'revpar';
  if (/\b(adr|average (daily )?rate|room rate|rates?)\b/.test(text)) return 'adr';
  if (/\b(occupancy|occ|full|empty rooms?)\b/.test(text)) return 'occupancy';
  if (/\bcancell?ations?|cancell?ed\b/.test(text)) return 'cancellations';
  if (/\b(room nights|rooms sold|nights sold|how many rooms|how many nights|nights)\b/.test(text)) return 'rooms_sold';
  if (/\brevenue|sales|turnover\b/.test(text)) return 'room_revenue';
  return null;
}

const SEGMENT_WORDS: Record<Segment, RegExp> = {
  corporate: /\bcorporate|business travel/,
  leisure: /\bleisure\b/,
  group: /\bgroups?\b(?! blocks?)/,
  mice: /\bmice\b|\bmeetings?\b/,
};
const CHANNEL_WORDS: Record<Channel, RegExp> = {
  direct: /\bdirect\b/,
  ota: /\bota'?s?\b|\bbooking\.com\b|\bexpedia\b/,
  gds: /\bgds\b/,
  wholesale: /\bwholesale\b|\btour operators?\b/,
};

function parseFilters(question: string, groupBy: BreakdownDimension | null): { segments?: Segment[]; channels?: Channel[] } {
  const text = question.toLowerCase();
  const segments = groupBy === 'segment' ? [] : SEGMENTS.filter((segment) => SEGMENT_WORDS[segment].test(text));
  const channels = groupBy === 'channel' ? [] : CHANNELS.filter((channel) => CHANNEL_WORDS[channel].test(text));
  return { ...(segments.length > 0 ? { segments } : {}), ...(channels.length > 0 ? { channels } : {}) };
}

export interface ParsedDataQuestion {
  query: Omit<QueryPerformanceInput, 'hotelId'>;
  primaryMetric: BreakdownMetric;
  /** Rank rows by their change vs last year ("which segment moved most") instead of by value. */
  rankBy: 'value' | 'change';
}

/**
 * A performance query, or null when the question is not a data question.
 * It needs at least a split, an explicit period or a weekend/weekday filter;
 * "how is OTA doing?" alone stays with the channel analysis.
 */
export function parseDataQuestion(question: string, today: IsoDate): ParsedDataQuestion | null {
  const text = question.toLowerCase();
  const monthToDatePeriod = { from: calendarMonthOf(today).from, to: today };
  const parsedPeriod = parsePeriod(question, today);
  // "This month" is the default period, so on its own it does not make a question a data question
  // ("What are OTA commissions costing us this month?" stays with the channel analysis).
  const explicitPeriod = parsedPeriod && (parsedPeriod.from !== monthToDatePeriod.from || parsedPeriod.to !== monthToDatePeriod.to) ? parsedPeriod : null;
  const { groupBy, dayType } = parseSplit(question);
  if (!groupBy && !explicitPeriod && !dayType) return null;

  const compareWithLastYear = /\b(vs\.?|versus|compared? (with|to)|than) last year\b|\blast year\b|\byear on year\b|\byoy\b/.test(text);
  const filters = parseFilters(question, groupBy);
  return {
    query: {
      period: explicitPeriod ?? monthToDatePeriod,
      groupBy: groupBy ?? 'none',
      ...filters,
      ...(dayType ? { dayType } : {}),
      compareWithLastYear,
    },
    primaryMetric: parseMetric(question) ?? 'room_revenue',
    rankBy: compareWithLastYear && /\b(moved|changed?|grew|fell|dropped|declined|increased|decreased)\b/.test(text) ? 'change' : 'value',
  };
}

/** "Are other group blocks at risk this quarter?" — the period of a group block question. */
export function parseGroupBlockQuestion(question: string, today: IsoDate): DateRange | null {
  const text = question.toLowerCase();
  if (!/\b(group blocks?|blocks?|congress(es)?|conferences?|events?)\b/.test(text)) return null;
  if (/\bquarter\b/.test(text)) {
    const month = Number(today.slice(5, 7));
    const year = Number(today.slice(0, 4));
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return { from: isoDate(year, firstMonth, 1), to: calendarMonthOf(isoDate(year, firstMonth + 2, 1)).to };
  }
  return parsePeriod(question, today) ?? { from: calendarMonthOf(today).from, to: addDays(today, 90) };
}

/** Words that make a question about the gap vs target and its drivers, which the existing analyses answer. */
export function isAboutTheTargetGap(question: string): boolean {
  return /\b(why|gap|target|budget|drivers?|effects?|lost|losing|replac\w*|shortfall|missing|explain)\b/i.test(question);
}

export function isAboutPace(question: string): boolean {
  return /\b(pace|pick-?up|on the books|otb|forecast)\b/i.test(question);
}
