import {
  formatEuro,
  formatPercent,
  formatPercentagePoints,
  METRIC_META,
  type MetricId,
  type MetricStatus,
} from '@aurora/shared';

// How metrics look on screen. The values and statuses come from the server;
// this file only decides how to write them.

/** Status is never shown by colour alone: there is always an icon and a text label too. */
export const STATUS_DISPLAY: Record<MetricStatus, { icon: string; label: string; modifier: string }> = {
  on_track: { icon: '↑', label: 'On track', modifier: 'on-track' },
  watch: { icon: '!', label: 'Watch', modifier: 'watch' },
  off_track: { icon: '↓', label: 'Off track', modifier: 'off-track' },
};

/** Decimals per metric, as in the design: "€178", "€110.37", "62.0%". */
const CURRENCY_DECIMALS: Partial<Record<MetricId, number>> = { adr: 0, revpar: 2, net_revpar: 2, room_revenue: 0 };

export function formatMetricValue(metric: MetricId, value: number): string {
  const { unit } = METRIC_META[metric];
  if (unit === 'ratio') return formatPercent(value);
  if (unit === 'currency') return formatEuro(value, { decimals: CURRENCY_DECIMALS[metric] ?? 0 });
  return new Intl.NumberFormat('en-GB').format(value);
}

/** The reference under a KPI value: "target 75.0%", "target €171.15". */
export function formatMetricReference(metric: MetricId, reference: number): string {
  const { unit } = METRIC_META[metric];
  if (unit === 'ratio') return formatPercent(reference);
  if (unit === 'currency') return formatEuro(reference, { decimals: 2 });
  return new Intl.NumberFormat('en-GB').format(reference);
}

/** "−13.0 pp" for ratios, "+4.0%" for everything else. */
export function formatMetricDelta(metric: MetricId, actual: number, reference: number): string {
  if (METRIC_META[metric].deltaStyle === 'percentage_points') return formatPercentagePoints(actual - reference);
  return formatPercent(reference === 0 ? 0 : actual / reference - 1, { signDisplay: 'always' });
}
