import { METRIC_META, type MetricId, type MetricStatus } from '@aurora/shared';
import { divideOrZero } from './kpi';

// ---------------------------------------------------------------------------
// On track / watch / off track.
//
// Computed here, not in the UI and not by the language model, so a KPI has the
// same status in the chat, in the evidence panel and through MCP.
// ---------------------------------------------------------------------------

/**
 * How much better (+) or worse (−) the actual is than the reference, as a
 * fraction of the reference, with the metric's direction taken into account.
 *
 *   ADR 178 vs 171.15 (higher is better)        -> +0.04  (4% better)
 *   Occupancy 0.62 vs 0.75 (higher is better)   -> −0.173 (17.3% worse)
 *   Cancellations 0.104 vs 0.10 (lower is better) -> −0.04  (4% worse)
 *
 * A reference of 0 gives 0, because there is nothing to compare against.
 */
export function calculatePerformanceVsReference(metric: MetricId, actual: number, reference: number): number {
  const relativeDifference = divideOrZero(actual - reference, Math.abs(reference));
  return METRIC_META[metric].direction === 'higher_is_better' ? relativeDifference : -relativeDifference;
}

export function classifyMetricStatus(metric: MetricId, actual: number, reference: number | null): MetricStatus {
  if (reference === null) return 'on_track';

  const { onTrackTolerance, offTrackThreshold } = METRIC_META[metric];
  const performance = calculatePerformanceVsReference(metric, actual, reference);

  if (performance >= -onTrackTolerance) return 'on_track';
  if (performance >= -offTrackThreshold) return 'watch';
  return 'off_track';
}
