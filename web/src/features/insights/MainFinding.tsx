import { formatEuro } from '@aurora/shared';
import type { ReactNode } from 'react';
import { STATUS_DISPLAY } from '../../lib/metric-display';
import type { InsightData } from '../../stream/run-reducer';
import type { FactInteraction } from './fact-links';

interface MainFindingProps {
  insight: InsightData;
  interaction: FactInteraction;
  /** Opens the provenance of the headline number in the evidence panel. */
  onShowCalculation: () => void;
  /** "Save insight", once the answer is complete. */
  saveButton?: ReactNode;
}

/**
 * The executive summary: the only strongly coloured element of the answer.
 * Its chips are the shortcuts into the investigation.
 */
export function MainFinding({ insight, interaction, onShowCalculation, saveButton }: MainFindingProps) {
  // Data answers ("occupancy on 5 November") have no target, so no impact pill.
  const impactEur = insight.impactEur;
  const isNegative = impactEur !== null && impactEur < 0;

  return (
    <section className="main-finding" aria-label="Main finding">
      <div className="main-finding__top">
        <span className="main-finding__eyebrow">Main finding</span>
        {impactEur !== null && (
          <span className={`main-finding__impact ${isNegative ? 'main-finding__impact--negative' : 'main-finding__impact--positive'}`}>
            <span aria-hidden="true">{isNegative ? '↓' : '↑'}</span>
            {formatEuro(impactEur, { signDisplay: 'always' })} vs target
          </span>
        )}
        {saveButton}
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
                <span
                  className={`insight-chip__dot insight-chip__dot--${chip.status ? STATUS_DISPLAY[chip.status].modifier : 'neutral'}`}
                  aria-hidden="true"
                />
                {chip.label}
                {chip.status && <span className="visually-hidden">, {STATUS_DISPLAY[chip.status].label}</span>}
              </button>
            );
          })}
          <button type="button" className="main-finding__calculation-link" onClick={onShowCalculation}>
            How was this calculated?
          </button>
        </div>
      </div>
    </section>
  );
}
