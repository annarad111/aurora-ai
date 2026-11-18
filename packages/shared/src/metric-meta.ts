import { z } from 'zod';

// ---------------------------------------------------------------------------
// Metric metadata: what each KPI means and how to judge it.
//
// "Green = going up" is wrong for some metrics (a higher cancellation rate is
// bad), so every metric declares its direction. The status rules in
// packages/analytics/src/status.ts read this table; the UI only colours the
// result.
// ---------------------------------------------------------------------------

export const METRIC_IDS = [
  'occupancy',
  'adr',
  'revpar',
  'net_revpar',
  'room_revenue',
  'rooms_sold',
  'ota_share',
  'booking_pace',
  'cancellation_rate',
] as const;
export const metricIdSchema = z.enum(METRIC_IDS);
export type MetricId = z.infer<typeof metricIdSchema>;

/**
 * How a value is stored and displayed.
 *   ratio    stored as a fraction (0.62), shown as a percentage (62.0%)
 *   currency euros
 *   count    whole numbers (room nights)
 */
export type MetricUnit = 'ratio' | 'currency' | 'count';

/** Whether a bigger number is good news. */
export type MetricDirection = 'higher_is_better' | 'lower_is_better';

/**
 * How the difference to the reference is written.
 *   percentage_points  62% vs 75% -> "−13.0 pp"
 *   relative_percent   €178 vs €171.15 -> "+4.0%"
 */
export type DeltaStyle = 'percentage_points' | 'relative_percent';

export interface MetricMeta {
  label: string;
  unit: MetricUnit;
  direction: MetricDirection;
  deltaStyle: DeltaStyle;
  /**
   * Shortfall (as a fraction of the reference) that still counts as "on track".
   * 0.02 means: up to 2% worse than target is fine.
   */
  onTrackTolerance: number;
  /** Shortfall beyond which the metric is "off track". Between the two it is "watch". */
  offTrackThreshold: number;
}

export const METRIC_META: Record<MetricId, MetricMeta> = {
  occupancy: {
    label: 'Occupancy',
    unit: 'ratio',
    direction: 'higher_is_better',
    deltaStyle: 'percentage_points',
    onTrackTolerance: 0.02,
    offTrackThreshold: 0.05,
  },
  adr: {
    label: 'ADR',
    unit: 'currency',
    direction: 'higher_is_better',
    deltaStyle: 'relative_percent',
    onTrackTolerance: 0.02,
    offTrackThreshold: 0.05,
  },
  revpar: {
    label: 'RevPAR',
    unit: 'currency',
    direction: 'higher_is_better',
    deltaStyle: 'relative_percent',
    onTrackTolerance: 0.02,
    offTrackThreshold: 0.05,
  },
  net_revpar: {
    label: 'Net RevPAR',
    unit: 'currency',
    direction: 'higher_is_better',
    deltaStyle: 'relative_percent',
    onTrackTolerance: 0.02,
    offTrackThreshold: 0.05,
  },
  room_revenue: {
    label: 'Room revenue',
    unit: 'currency',
    direction: 'higher_is_better',
    deltaStyle: 'relative_percent',
    onTrackTolerance: 0.02,
    offTrackThreshold: 0.05,
  },
  rooms_sold: {
    label: 'Room nights',
    unit: 'count',
    direction: 'higher_is_better',
    deltaStyle: 'relative_percent',
    onTrackTolerance: 0.02,
    offTrackThreshold: 0.05,
  },
  ota_share: {
    // More OTA share means more commission, so lower is better.
    label: 'OTA share',
    unit: 'ratio',
    direction: 'lower_is_better',
    deltaStyle: 'percentage_points',
    onTrackTolerance: 0.05,
    offTrackThreshold: 0.2,
  },
  booking_pace: {
    // Pace is a forward-looking warning, so it only turns "off track" when far behind.
    label: 'Booking pace',
    unit: 'count',
    direction: 'higher_is_better',
    deltaStyle: 'relative_percent',
    onTrackTolerance: 0.03,
    offTrackThreshold: 0.2,
  },
  cancellation_rate: {
    label: 'Cancellation rate',
    unit: 'ratio',
    direction: 'lower_is_better',
    deltaStyle: 'percentage_points',
    onTrackTolerance: 0.05,
    offTrackThreshold: 0.15,
  },
};

export const METRIC_STATUSES = ['on_track', 'watch', 'off_track'] as const;
export const metricStatusSchema = z.enum(METRIC_STATUSES);
export type MetricStatus = z.infer<typeof metricStatusSchema>;
