import { formatEuroCompact, formatPeriodLabel, type RevenueDriversOutput } from '@aurora/shared';
import { useMemo } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';
import { buildRevenueBridge, toAxisPercent } from './revenue-bridge-geometry';
import { useDrawOnMount } from './useDrawOnMount';

interface RevenueBridgeCardProps {
  drivers: RevenueDriversOutput;
  interaction: FactInteraction;
}

/** Waterfall from target to actual room revenue. Every bar is a button linked to its fact. */
export function RevenueBridgeCard({ drivers, interaction }: RevenueBridgeCardProps) {
  const bridge = useMemo(() => buildRevenueBridge(drivers), [drivers]);
  const isDrawn = useDrawOnMount();

  return (
    <section className="evidence-card" aria-label="Revenue bridge">
      <header className="evidence-card__header">
        <div className="evidence-card__titles">
          <span className="evidence-card__title">Revenue bridge</span>
          <span className="evidence-card__subtitle">Target to actual, room revenue, {formatPeriodLabel(drivers.period)}</span>
        </div>
      </header>

      <div className="revenue-bridge__plot">
        {bridge.bars.map((bar) => {
          const isHighlighted = bar.factIds.some((factId) => isFactHighlighted(factId, interaction.activeFactId));
          const bottomPercent = isDrawn ? toAxisPercent(bar.bottomValue, bridge) : 0;
          const heightPercent = isDrawn ? toAxisPercent(bar.topValue, bridge) - toAxisPercent(bar.bottomValue, bridge) : 0;
          return (
            <button
              key={bar.id}
              type="button"
              className="revenue-bridge__column"
              aria-label={`${bar.label} ${bar.valueLabel}`}
              aria-pressed={interaction.focusedFactId === bar.primaryFactId}
              onClick={() => interaction.focusFact(bar.primaryFactId)}
              onMouseEnter={() => interaction.hoverFact(bar.primaryFactId)}
              onMouseLeave={() => interaction.hoverFact(null)}
              onFocus={() => interaction.hoverFact(bar.primaryFactId)}
              onBlur={() => interaction.hoverFact(null)}
            >
              <span
                className={`revenue-bridge__value revenue-bridge__value--${bar.tone}`}
                style={{ bottom: `calc(${bottomPercent + heightPercent}% + 4px)` }}
              >
                {bar.valueLabel}
              </span>
              <span
                className={joinClassNames(
                  'revenue-bridge__bar',
                  `revenue-bridge__bar--${bar.tone}`,
                  isHighlighted && 'revenue-bridge__bar--highlighted',
                )}
                style={{ bottom: `${bottomPercent}%`, height: `${heightPercent}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="revenue-bridge__labels" aria-hidden="true">
        {bridge.bars.map((bar) => (
          <span key={bar.id}>{bar.label}</span>
        ))}
      </div>

      <p className="evidence-card__note">
        Axis starts at {formatEuroCompact(bridge.axisMinimum)}. Volume + mix + price = gap, exactly.
      </p>
    </section>
  );
}
