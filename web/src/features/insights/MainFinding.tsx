import { formatEuro } from '@aurora/shared';
import { STATUS_DISPLAY } from '../../lib/metric-display';
import type { InsightData } from '../../stream/run-reducer';
import type { FactInteraction } from './fact-links';

interface MainFindingProps {
  insight: InsightData;
  interaction: FactInteraction;
}

/**
 * The executive summary: the only strongly coloured element of the answer.
 * Its chips are the shortcuts into the investigation.
 */
export function MainFinding({ insight, interaction }: MainFindingProps) {
  const isNegative = insight.impactEur < 0;

  return (
    <section className="main-finding" aria-label="Main finding">
      <div className="main-finding__top">
        <span className="main-finding__eyebrow">Main finding</span>
        <span className={`main-finding__impact ${isNegative ? 'main-finding__impact--negative' : 'main-finding__impact--positive'}`}>
          <span aria-hidden="true">{isNegative ? '↓' : '↑'}</span>
          {formatEuro(insight.impactEur, { signDisplay: 'always' })} vs target
        </span>
      </div>

      <p className="main-finding__headline">{insight.headline}</p>

      <div className="main-finding__investigate">
        <span className="main-finding__prompt">Select an insight to investigate:</span>
        <div className="main-finding__chips">
          {insight.chips.map((chip) => {
            const isSelected = interaction.focusedFactId === chip.factId;
            return (
              <button
                key={chip.factId}
                type="button"
                className="insight-chip"
                aria-pressed={isSelected}
                onClick={() => interaction.focusFact(chip.factId)}
                onMouseEnter={() => interaction.hoverFact(chip.factId)}
                onMouseLeave={() => interaction.hoverFact(null)}
                onFocus={() => interaction.hoverFact(chip.factId)}
                onBlur={() => interaction.hoverFact(null)}
              >
                <span className={`insight-chip__dot insight-chip__dot--${STATUS_DISPLAY[chip.status].modifier}`} aria-hidden="true" />
                {chip.label}
                <span className="visually-hidden">, {STATUS_DISPLAY[chip.status].label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
