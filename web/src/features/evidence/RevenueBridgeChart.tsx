import type { RevenueDriversOutput } from '@aurora/shared';
import { useMemo } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';
import { buildRevenueBridge, toAxisPercent } from './revenue-bridge-geometry';
import { useDrawOnMount } from './useDrawOnMount';

interface RevenueBridgeChartProps {
  drivers: RevenueDriversOutput;
  interaction: FactInteraction;
  /** "compact" in the evidence panel, "large" in the Explore overlay. */
  size: 'compact' | 'large';
}

/** The waterfall itself: one button per bar, linked to its fact. Used by the card and by the overlay. */
export function RevenueBridgeChart({ drivers, interaction, size }: RevenueBridgeChartProps) {
  const bridge = useMemo(() => buildRevenueBridge(drivers), [drivers]);
  const isDrawn = useDrawOnMount();

  return (
    <div className={`revenue-bridge revenue-bridge--${size}`}>
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
    </div>
  );
}

/** "€160k": where the axis starts, so the card can say so. */
export function useBridgeAxisMinimum(drivers: RevenueDriversOutput): number {
  return useMemo(() => buildRevenueBridge(drivers).axisMinimum, [drivers]);
}
