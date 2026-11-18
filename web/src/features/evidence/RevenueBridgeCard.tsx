import { formatEuroCompact, formatPeriodLabel, type RevenueDriversOutput } from '@aurora/shared';
import type { FactInteraction } from '../insights/fact-links';
import { ExpandButton } from './ExpandButton';
import { RevenueBridgeChart, useBridgeAxisMinimum } from './RevenueBridgeChart';

interface RevenueBridgeCardProps {
  drivers: RevenueDriversOutput;
  interaction: FactInteraction;
  onExpand: () => void;
}

/** Waterfall from target to actual room revenue, in the evidence panel. */
export function RevenueBridgeCard({ drivers, interaction, onExpand }: RevenueBridgeCardProps) {
  const axisMinimum = useBridgeAxisMinimum(drivers);

  return (
    <section className="evidence-card" aria-label="Revenue bridge">
      <header className="evidence-card__header">
        <div className="evidence-card__titles">
          <span className="evidence-card__title">Revenue bridge</span>
          <span className="evidence-card__subtitle">Target to actual, room revenue, {formatPeriodLabel(drivers.period)}</span>
        </div>
        <ExpandButton chartName="revenue bridge" onExpand={onExpand} />
      </header>

      <RevenueBridgeChart drivers={drivers} interaction={interaction} size="compact" />

      <p className="evidence-card__note">Axis starts at {formatEuroCompact(axisMinimum)}. Volume + mix + price = gap, exactly.</p>
    </section>
  );
}
