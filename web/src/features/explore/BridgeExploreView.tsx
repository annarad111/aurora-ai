import { formatCount, formatEuro, formatEuroCompact, formatPercent, SEGMENT_LABELS, type RevenueDriversOutput } from '@aurora/shared';
import { joinClassNames } from '../../lib/class-names';
import type { RunState } from '../../stream/run-reducer';
import { RevenueBridgeChart } from '../evidence/RevenueBridgeChart';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';

interface BridgeExploreViewProps {
  drivers: RevenueDriversOutput;
  run: RunState;
  interaction: FactInteraction;
}

/** Larger waterfall, plus the volume effect drilled down by segment. */
export function BridgeExploreView({ drivers, run, interaction }: BridgeExploreViewProps) {
  const segmentsByImpact = [...drivers.segments].sort((first, second) => first.volumeEffect - second.volumeEffect);
  const largestEffect = Math.max(...drivers.segments.map((segment) => Math.abs(segment.volumeEffect)), 1);
  const biggestLoss = segmentsByImpact[0];
  const biggestGain = segmentsByImpact.at(-1);
  const selectedProvenance = interaction.focusedFactId ? run.provenanceByFactId[interaction.focusedFactId] : undefined;

  return (
    <div className="explore-view">
      <div className="explore-view__columns">
        <div className="explore-view__panel">
          <span className="explore-view__panel-title">Target to actual</span>
          <RevenueBridgeChart drivers={drivers} interaction={interaction} size="large" />
        </div>

        <div className="explore-view__panel">
          <div className="evidence-card__titles">
            <span className="explore-view__panel-title">Volume effect by segment</span>
            <span className="evidence-card__subtitle">Drill-down of the {formatEuroCompact(drivers.volumeEffect)} volume bar</span>
          </div>

          {segmentsByImpact.map((segment) => {
            const factId = `volume_${segment.segment}`;
            const barWidthPercent = (Math.abs(segment.volumeEffect) / largestEffect) * 50;
            const isLoss = segment.volumeEffect < 0;
            return (
              <button
                key={segment.segment}
                type="button"
                className={joinClassNames('diverging-row', isFactHighlighted(factId, interaction.activeFactId) && 'diverging-row--highlighted')}
                aria-label={`${SEGMENT_LABELS[segment.segment]} ${formatEuro(segment.volumeEffect, { signDisplay: 'always' })}`}
                onClick={() => interaction.focusFact(factId)}
                onMouseEnter={() => interaction.hoverFact(factId)}
                onMouseLeave={() => interaction.hoverFact(null)}
              >
                <span className="diverging-row__label">{SEGMENT_LABELS[segment.segment]}</span>
                <span className="diverging-row__track">
                  <span className="diverging-row__axis" />
                  <span
                    className={`diverging-row__bar diverging-row__bar--${isLoss ? 'negative' : 'positive'}`}
                    style={
                      isLoss
                        ? { left: `${50 - barWidthPercent}%`, right: '50%' }
                        : { left: '50%', right: `${50 - barWidthPercent}%` }
                    }
                  />
                </span>
                <span className={`diverging-row__value diverging-row__value--${isLoss ? 'negative' : 'positive'}`}>
                  {formatEuroCompact(segment.volumeEffect, { signDisplay: 'always' })}
                </span>
              </button>
            );
          })}

          {biggestLoss && drivers.volumeEffect !== 0 && (
            <p className="explore-view__note">
              {SEGMENT_LABELS[biggestLoss.segment]} accounts for {formatPercent(biggestLoss.volumeEffect / drivers.volumeEffect, { decimals: 0 })} of
              the volume effect.
              {biggestGain && biggestGain.volumeEffect > 0 &&
                ` ${SEGMENT_LABELS[biggestGain.segment]} partly compensated with ${formatCount(biggestGain.roomsSoldActual - biggestGain.roomsSoldTarget)} extra room nights.`}
            </p>
          )}
        </div>
      </div>

      {selectedProvenance && (
        <div className="formula-strip" aria-live="polite">
          <span className="formula-strip__title">
            {selectedProvenance.title} · <strong>{selectedProvenance.displayValue}</strong>
          </span>
          <code className="formula-strip__formula">{selectedProvenance.formula}</code>
        </div>
      )}
    </div>
  );
}
