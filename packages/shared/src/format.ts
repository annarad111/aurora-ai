// ---------------------------------------------------------------------------
// Number formatting, shared by the worker (narrative, provenance) and the web
// app (cards, charts), so a figure is written the same way everywhere. The
// number guard in step 8 depends on that.
//
// Conventions from the design:
//   - the minus sign is the typographic "−" (U+2212), not a hyphen
//   - euros: "€208,260", signed "−€33,917" / "+€8,015"
//   - percentages are stored as fractions: 0.62 -> "62.0%"
//   - percentage-point differences: −0.13 -> "−13.0 pp"
// ---------------------------------------------------------------------------

export const MINUS_SIGN = '−';

type SignDisplay = 'negative_only' | 'always';

function signPrefix(value: number, signDisplay: SignDisplay): string {
  if (value < 0) return MINUS_SIGN;
  if (signDisplay === 'always' && value > 0) return '+';
  return '';
}

/**
 * Rounds first, so a value like −0.004 shown with 2 decimals becomes "0.00"
 * and not "−0.00".
 */
function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatUnsignedNumber(absoluteValue: number, decimals: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(absoluteValue);
}

interface FormatOptions {
  decimals?: number;
  signDisplay?: SignDisplay;
}

/** 208260 -> "€208,260"; with decimals 2: 171.1498 -> "€171.15". */
export function formatEuro(amount: number, { decimals = 0, signDisplay = 'negative_only' }: FormatOptions = {}): string {
  const roundedAmount = roundToDecimals(amount, decimals);
  return `${signPrefix(roundedAmount, signDisplay)}€${formatUnsignedNumber(Math.abs(roundedAmount), decimals)}`;
}

/**
 * Short euro amounts for chart labels.
 * 242177 -> "€242k", −41932 -> "−€41.9k", 14255 -> "€14.3k" (or "+€14.3k" with signDisplay "always").
 * Amounts of €100k and more drop the decimal.
 */
export function formatEuroCompact(amount: number, { signDisplay = 'negative_only' }: Pick<FormatOptions, 'signDisplay'> = {}): string {
  const thousands = amount / 1000;
  const decimals = Math.abs(thousands) >= 100 ? 0 : 1;
  const roundedThousands = roundToDecimals(thousands, decimals);
  return `${signPrefix(roundedThousands, signDisplay)}€${formatUnsignedNumber(Math.abs(roundedThousands), decimals)}k`;
}

/** 0.62 -> "62.0%"; with signDisplay "always": 0.04 -> "+4.0%". */
export function formatPercent(ratio: number, { decimals = 1, signDisplay = 'negative_only' }: FormatOptions = {}): string {
  const roundedPercent = roundToDecimals(ratio * 100, decimals);
  return `${signPrefix(roundedPercent, signDisplay)}${formatUnsignedNumber(Math.abs(roundedPercent), decimals)}%`;
}

/** Difference between two ratios, in percentage points: (0.62 − 0.75) -> "−13.0 pp". */
export function formatPercentagePoints(ratioDifference: number, { decimals = 1 }: Pick<FormatOptions, 'decimals'> = {}): string {
  const roundedPoints = roundToDecimals(ratioDifference * 100, decimals);
  return `${signPrefix(roundedPoints, 'always')}${formatUnsignedNumber(Math.abs(roundedPoints), decimals)} pp`;
}

const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function readDateParts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/**
 * Human label for an inclusive date range.
 *   a whole calendar month   -> "Sep 2026"
 *   inside one month         -> "1–17 Nov 2026"
 *   across months            -> "28 Oct – 3 Nov 2026"
 */
export function formatPeriodLabel(range: { from: string; to: string }): string {
  const start = readDateParts(range.from);
  const end = readDateParts(range.to);
  const endMonthName = MONTH_SHORT_NAMES[end.month - 1];
  const lastDayOfEndMonth = new Date(Date.UTC(end.year, end.month, 0)).getUTCDate();

  const isSameMonth = start.year === end.year && start.month === end.month;
  if (isSameMonth && start.day === 1 && end.day === lastDayOfEndMonth) {
    return `${endMonthName} ${end.year}`;
  }
  if (isSameMonth) {
    return start.day === end.day ? `${end.day} ${endMonthName} ${end.year}` : `${start.day}–${end.day} ${endMonthName} ${end.year}`;
  }
  const startMonthName = MONTH_SHORT_NAMES[start.month - 1];
  const startYearSuffix = start.year === end.year ? '' : ` ${start.year}`;
  return `${start.day} ${startMonthName}${startYearSuffix} – ${end.day} ${endMonthName} ${end.year}`;
}

/** 1170 -> "1,170"; with signDisplay "always": −245 -> "−245". */
export function formatCount(count: number, { signDisplay = 'negative_only' }: Pick<FormatOptions, 'signDisplay'> = {}): string {
  const roundedCount = roundToDecimals(count, 0);
  return `${signPrefix(roundedCount, signDisplay)}${formatUnsignedNumber(Math.abs(roundedCount), 0)}`;
}
