import {
  BREAKDOWN_DIMENSION_LABELS,
  BREAKDOWN_METRIC_INFO,
  BREAKDOWN_METRICS,
  formatPercent,
  formatPercentagePoints,
  formatPeriodLabel,
  type BreakdownMetric,
  type PerformanceRow,
  type PerformanceValues,
  type QueryPerformanceOutput,
} from '@aurora/shared';
import { useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';
import { useDrawOnMount } from './useDrawOnMount';

interface PerformanceTableCardProps {
  output: QueryPerformanceOutput;
  /** The metric the answer is about; the card opens on it. */
  initialMetric: BreakdownMetric;
  interaction: FactInteraction;
}

const VALUE_OF_METRIC: Record<BreakdownMetric, (values: PerformanceValues) => number> = {
  occupancy: (values) => values.occupancy,
  adr: (values) => values.adr,
  revpar: (values) => values.revpar,
  net_revpar: (values) => values.netRevpar,
  room_revenue: (values) => values.roomRevenue,
  rooms_sold: (values) => values.roomsSold,
  cancellations: (values) => values.cancellations,
};

/** The same fact id the server uses for this row and metric (see data-answers.ts). */
function factIdOf(rowKey: string, metric: BreakdownMetric): string {
  return `query.0.${rowKey}.${metric}`;
}

function describeChange(metric: BreakdownMetric, row: PerformanceRow): string | null {
  if (!row.lastYear) return null;
  const current = VALUE_OF_METRIC[metric](row);
  const previous = VALUE_OF_METRIC[metric](row.lastYear);
  if (metric === 'occupancy') return formatPercentagePoints(current - previous);
  return previous === 0 ? null : formatPercent(current / previous - 1, { signDisplay: 'always' });
}

/**
 * The result of a data question as a ranked list with bars. The metric can be
 * switched without asking again; every row links to its provenance.
 */
export function PerformanceTableCard({ output, initialMetric, interaction }: PerformanceTableCardProps) {
  const [metric, setMetric] = useState<BreakdownMetric>(initialMetric);
  const isDrawn = useDrawOnMount();
  const info = BREAKDOWN_METRIC_INFO[metric];
  const readValue = VALUE_OF_METRIC[metric];
  // Nights keep their calendar order; other splits keep the server's order (segments, channels, weekdays).
  const rows = output.rows;
  const largestValue = Math.max(...rows.map(readValue), 0) || 1;

  return (
    <section className="evidence-card" aria-label="Query result">
      <header className="evidence-card__header">
        <div className="evidence-card__titles">
          <span className="evidence-card__title">
            {info.label} {output.groupBy === 'none' ? '' : BREAKDOWN_DIMENSION_LABELS[output.groupBy]}
          </span>
          <span className="evidence-card__subtitle">
            {formatPeriodLabel(output.period)}
            {output.filters.dayType ? ` · ${output.filters.dayType} nights` : ''}
            {output.rows.some((row) => row.lastYear) ? ' · vs last year' : ''}
          </span>
        </div>
        <select className="metric-picker" aria-label="Metric" value={metric} onChange={(event) => setMetric(event.target.value as BreakdownMetric)}>
          {BREAKDOWN_METRICS.map((option) => (
            <option key={option} value={option}>
              {BREAKDOWN_METRIC_INFO[option].label}
            </option>
          ))}
        </select>
      </header>

      <div className="performance-table" role="list">
        {[...rows, output.totals].map((row) => {
          const factId = factIdOf(row.key, metric);
          const isTotal = row.key === 'total';
          const change = describeChange(metric, row);
          return (
            <button
              key={row.key}
              type="button"
              role="listitem"
              className={joinClassNames(
                'performance-table__row',
                isTotal && 'performance-table__row--total',
                isFactHighlighted(factId, interaction.activeFactId) && 'performance-table__row--highlighted',
              )}
              onClick={() => interaction.focusFact(factId)}
              onMouseEnter={() => interaction.hoverFact(factId)}
              onMouseLeave={() => interaction.hoverFact(null)}
            >
              <span className="performance-table__label">{isTotal ? 'Total' : row.label}</span>
              <span className="performance-table__track">
                {!isTotal && (
                  <span className="performance-table__bar" style={{ width: isDrawn ? `${(Math.max(readValue(row), 0) / largestValue) * 100}%` : '0%' }} />
                )}
              </span>
              <span className="performance-table__value">{info.format(readValue(row))}</span>
              {change !== null && (
                <span className={joinClassNames('performance-table__change', change.startsWith('−') && 'performance-table__change--down')}>{change}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
