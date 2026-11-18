import { joinClassNames } from '../../lib/class-names';
import { formatMetricDelta, formatMetricReference, formatMetricValue, STATUS_DISPLAY } from '../../lib/metric-display';
import type { KpiCardData } from '../../stream/run-reducer';
import { isFactHighlighted, type FactInteraction } from './fact-links';

interface KpiCardProps {
  kpi: KpiCardData;
  interaction: FactInteraction;
}

/** Net RevPAR's reference line explains what it is instead of repeating the target (as in the design). */
function describeReference(kpi: KpiCardData): string {
  if (kpi.metric === 'net_revpar') return 'after commissions';
  if (kpi.reference === null) return '';
  return `${kpi.referenceKind === 'last_year' ? 'last year' : 'target'} ${formatMetricReference(kpi.metric, kpi.reference)}`;
}

export function KpiCard({ kpi, interaction }: KpiCardProps) {
  const statusDisplay = STATUS_DISPLAY[kpi.status];

  return (
    <button
      type="button"
      className={joinClassNames('kpi-card', isFactHighlighted(kpi.factId, interaction.activeFactId) && 'kpi-card--highlighted')}
      onClick={() => interaction.focusFact(kpi.factId)}
      onMouseEnter={() => interaction.hoverFact(kpi.factId)}
      onMouseLeave={() => interaction.hoverFact(null)}
      onFocus={() => interaction.hoverFact(kpi.factId)}
      onBlur={() => interaction.hoverFact(null)}
    >
      <span className="kpi-card__label">{kpi.label}</span>
      <span className="kpi-card__value">{formatMetricValue(kpi.metric, kpi.actual)}</span>
      {kpi.reference !== null && (
        <span className={`status-badge status-badge--${statusDisplay.modifier}`}>
          <span aria-hidden="true">{statusDisplay.icon}</span>
          {formatMetricDelta(kpi.metric, kpi.actual, kpi.reference)}
          <span className="visually-hidden">, {statusDisplay.label}</span>
        </span>
      )}
      <span className="kpi-card__reference">{describeReference(kpi)}</span>
    </button>
  );
}

export function KpiGrid({ kpis, interaction }: { kpis: KpiCardData[]; interaction: FactInteraction }) {
  return (
    <div className="kpi-grid">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.factId} kpi={kpi} interaction={interaction} />
      ))}
    </div>
  );
}
