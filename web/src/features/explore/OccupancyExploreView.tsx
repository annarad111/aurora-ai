import { formatCount, formatPercent, formatPeriodLabel, isCancelledBlockNight, type HotelOverviewOutput } from '@aurora/shared';
import { useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { dayOfMonth, formatWeekdayDate } from '../../lib/dates';
import { ChartTooltip } from './ChartTooltip';

interface OccupancyExploreViewProps {
  overview: HotelOverviewOutput;
}

interface LayerToggle {
  key: 'target' | 'lastYear' | 'cancelledBlock';
  label: string;
  /** CSS modifier for the little swatch next to the label. */
  swatch: 'target' | 'last-year' | 'cancelled-block';
}

/** Daily occupancy, with switchable layers: target line, last year ticks, cancelled block nights. */
export function OccupancyExploreView({ overview }: OccupancyExploreViewProps) {
  const [visibleLayers, setVisibleLayers] = useState({ target: true, lastYear: false, cancelledBlock: true });
  const [hoveredNightIndex, setHoveredNightIndex] = useState<number | null>(null);

  const periodTarget = overview.kpis.find((kpi) => kpi.metric === 'occupancy')?.target ?? null;
  const nights = overview.dailyOccupancy;
  const layerToggles: LayerToggle[] = [
    ...(periodTarget === null ? [] : [{ key: 'target' as const, label: `Target ${formatPercent(periodTarget, { decimals: 0 })}`, swatch: 'target' as const }]),
    { key: 'lastYear', label: 'Last year', swatch: 'last-year' },
    { key: 'cancelledBlock', label: 'Cancelled block', swatch: 'cancelled-block' },
  ];

  return (
    <div className="explore-view">
      <div className="layer-toggles" role="group" aria-label="Chart layers">
        {layerToggles.map((toggle) => (
          <button
            key={toggle.key}
            type="button"
            className="layer-toggle"
            aria-pressed={visibleLayers[toggle.key]}
            onClick={() => setVisibleLayers((layers) => ({ ...layers, [toggle.key]: !layers[toggle.key] }))}
          >
            <span className={`layer-toggle__swatch layer-toggle__swatch--${toggle.swatch}`} aria-hidden="true" />
            {toggle.label}
          </button>
        ))}
      </div>

      <div className="column-chart column-chart--occupancy" style={{ gridTemplateColumns: `repeat(${nights.length}, minmax(0, 1fr))` }}>
        {visibleLayers.target && periodTarget !== null && (
          <div className="column-chart__target-line" style={{ bottom: `${periodTarget * 100}%` }}>
            <span className="column-chart__target-label">Target {formatPercent(periodTarget, { decimals: 0 })}</span>
          </div>
        )}

        {nights.map((night, nightIndex) => {
          const isBlockNight = visibleLayers.cancelledBlock && isCancelledBlockNight(night, overview.hotel.roomCount);
          const isHovered = hoveredNightIndex === nightIndex;
          return (
            <div
              key={night.date}
              className="column-chart__column"
              onMouseEnter={() => setHoveredNightIndex(nightIndex)}
              onMouseLeave={() => setHoveredNightIndex(null)}
            >
              <span
                className={joinClassNames(
                  'column-chart__bar',
                  isBlockNight ? 'column-chart__bar--alert' : 'column-chart__bar--primary',
                  hoveredNightIndex !== null && !isHovered && 'column-chart__bar--dimmed',
                )}
                style={{ height: `${night.occupancy * 100}%` }}
              />
              {visibleLayers.lastYear && <span className="column-chart__tick" style={{ bottom: `${night.occupancyLastYear * 100}%` }} />}
              {isHovered && (
                <ChartTooltip columnIndex={nightIndex} columnCount={nights.length} bottom={`calc(${night.occupancy * 100}% + 10px)`}>
                  <strong>{formatWeekdayDate(night.date)}</strong>
                  <span>
                    Occupancy {formatPercent(night.occupancy)}
                    {night.occupancyTarget !== null && ` · target ${formatPercent(night.occupancyTarget)}`}
                  </span>
                  <span>Last year {formatPercent(night.occupancyLastYear)}</span>
                  {isCancelledBlockNight(night, overview.hotel.roomCount) && (
                    <strong>{formatCount(night.roomsCancelled)} room nights cancelled</strong>
                  )}
                </ChartTooltip>
              )}
            </div>
          );
        })}
      </div>
      <div className="column-chart__labels" style={{ gridTemplateColumns: `repeat(${nights.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {nights.map((night) => (
          <span
            key={night.date}
            className={joinClassNames(
              visibleLayers.cancelledBlock && isCancelledBlockNight(night, overview.hotel.roomCount) && 'column-chart__label--alert',
            )}
          >
            {dayOfMonth(night.date)}
          </span>
        ))}
      </div>

      <p className="explore-view__note">Daily occupancy, {formatPeriodLabel(overview.period)}. Hover a night for details.</p>
    </div>
  );
}
