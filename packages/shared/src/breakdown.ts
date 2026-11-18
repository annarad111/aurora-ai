import { z } from 'zod';
import { formatCount, formatEuro, formatPercent } from './format';

// ---------------------------------------------------------------------------
// The vocabulary of free-form data questions ("ADR on weekends by channel",
// "occupancy on 5 November"): how a period can be split, and which metrics
// every row carries. Shared so the worker, the UI and MCP clients agree.
// ---------------------------------------------------------------------------

export const BREAKDOWN_DIMENSIONS = ['none', 'day', 'weekday', 'day_type', 'segment', 'channel'] as const;
export const breakdownDimensionSchema = z.enum(BREAKDOWN_DIMENSIONS);
export type BreakdownDimension = z.infer<typeof breakdownDimensionSchema>;

export const BREAKDOWN_DIMENSION_LABELS: Record<BreakdownDimension, string> = {
  none: 'in total',
  day: 'by night',
  weekday: 'by day of the week',
  day_type: 'weekend vs weekday',
  segment: 'by segment',
  channel: 'by channel',
};

/** Weekend nights in hotels are Friday and Saturday (the nights guests stay over the weekend). */
export const DAY_TYPES = ['weekend', 'weekday'] as const;
export const dayTypeSchema = z.enum(DAY_TYPES);
export type DayType = z.infer<typeof dayTypeSchema>;

export const BREAKDOWN_METRICS = ['occupancy', 'adr', 'revpar', 'net_revpar', 'room_revenue', 'rooms_sold', 'cancellations'] as const;
export const breakdownMetricSchema = z.enum(BREAKDOWN_METRICS);
export type BreakdownMetric = z.infer<typeof breakdownMetricSchema>;

interface BreakdownMetricInfo {
  label: string;
  /** How the value is written: "62.0%", "€178.00", "1,170". */
  format: (value: number) => string;
  /** The formula shown in "How was this calculated?". */
  formula: string;
}

export const BREAKDOWN_METRIC_INFO: Record<BreakdownMetric, BreakdownMetricInfo> = {
  occupancy: { label: 'Occupancy', format: (value) => formatPercent(value), formula: 'rooms sold / rooms available' },
  adr: { label: 'ADR', format: (value) => formatEuro(value, { decimals: 2 }), formula: 'room revenue / rooms sold' },
  revpar: { label: 'RevPAR', format: (value) => formatEuro(value, { decimals: 2 }), formula: 'room revenue / rooms available' },
  net_revpar: {
    label: 'Net RevPAR',
    format: (value) => formatEuro(value, { decimals: 2 }),
    formula: '(room revenue − commissions) / rooms available',
  },
  room_revenue: { label: 'Room revenue', format: (value) => formatEuro(value), formula: 'Σ room revenue' },
  rooms_sold: { label: 'Room nights sold', format: (value) => formatCount(value), formula: 'Σ rooms sold' },
  cancellations: { label: 'Cancellations', format: (value) => formatCount(value), formula: 'Σ cancelled room nights' },
};
