import { formatCount, formatPercent, formatPeriodLabel, isNightInCancelledBlock, type HotelOverviewOutput } from '@aurora/shared';
import { useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { dayOfMonth, formatWeekdayDate } from '../../lib/dates';
import { InvestigationPanel } from '../investigation/InvestigationPanel';
import type { ActionOptions, InvestigationAction } from '../investigation/investigation-actions';
import { useColumnSelection } from '../investigation/useColumnSelection';
import { ChartTooltip } from './ChartTooltip';

interface OccupancyExploreViewProps {
  overview: HotelOverviewOutput;
  actionOptions: ActionOptions;
  onAction: (action: InvestigationAction) => void;
}

interface LayerToggle {
  key: 'target' | 'lastYear' | 'cancelledBlock';
  label: string;
  /** CSS modifier for the little swatch next to the label. */
  swatch: 'target' | 'last-year' | 'cancelled-block';
}

/**
 * Daily occupancy, with switchable layers: target line, last year ticks, cancelled block nights.
 * Every night can be selected (click, or arrow keys and Enter) to investigate it.
 */
export function OccupancyExploreView({ overview, actionOptions, onAction }: OccupancyExploreViewProps) {
  const [visibleLayers, setVisibleLayers] = useState({ target: true, lastYear: false, cancelledBlock: true });
  const [hoveredNightIndex, setHoveredNightIndex] = useState<number | null>(null);

  const periodTarget = overview.kpis.find((kpi) => kpi.metric === 'occupancy')?.target ?? null;
  const nights = overview.dailyOccupancy;
  const { selectedIndex, focusedIndex, clearSelection, columnProps } = useColumnSelection(nights.length);
  const selectedNight = selectedIndex === null ? null : nights[selectedIndex];
  // The tooltip follows the pointer, else the keyboard focus.
  const tooltipIndex = hoveredNightIndex ?? focusedIndex;
  const highlightedIndex = hoveredNightIndex ?? selectedIndex;
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

      <div
        className="column-chart column-chart--occupancy column-chart--selectable"
        style={{ gridTemplateColumns: `repeat(${nights.length}, minmax(0, 1fr))` }}
        role="group"
        aria-label="Occupancy by night. Use the arrow keys to move and Enter to select a night."
      >
        {visibleLayers.target && periodTarget !== null && (
          <div className="column-chart__target-line" style={{ bottom: `${periodTarget * 100}%` }}>
            <span className="column-chart__target-label">Target {formatPercent(periodTarget, { decimals: 0 })}</span>
          </div>
        )}

        {nights.map((night, nightIndex) => {
          // Which nights belonged to a cancelled block comes from the group_blocks table.
          const cancelledBlock = isNightInCancelledBlock(night.date, overview.groupBlocks);
          const isBlockNight = visibleLayers.cancelledBlock && cancelledBlock !== null;
          const isSelected = selectedIndex === nightIndex;
          return (
            <button
              key={night.date}
              type="button"
              className={joinClassNames('column-chart__column', isSelected && 'column-chart__column--selected')}
              aria-label={`${formatWeekdayDate(night.date)}: occupancy ${formatPercent(night.occupancy)}${
                night.occupancyTarget !== null ? `, target ${formatPercent(night.occupancyTarget)}` : ''
              }${cancelledBlock ? `, ${cancelledBlock.name} cancelled` : ''}`}
              onMouseEnter={() => setHoveredNightIndex(nightIndex)}
              onMouseLeave={() => setHoveredNightIndex(null)}
              {...columnProps(nightIndex)}
            >
              <span
                className={joinClassNames(
                  'column-chart__bar',
                  isBlockNight ? 'column-chart__bar--alert' : 'column-chart__bar--primary',
                  highlightedIndex !== null && highlightedIndex !== nightIndex && !isSelected && 'column-chart__bar--dimmed',
                )}
                style={{ height: `${night.occupancy * 100}%` }}
              />
              {visibleLayers.lastYear && <span className="column-chart__tick" style={{ bottom: `${night.occupancyLastYear * 100}%` }} />}
              {tooltipIndex === nightIndex && (
                <ChartTooltip columnIndex={nightIndex} columnCount={nights.length} bottom={`calc(${night.occupancy * 100}% + 10px)`}>
                  <strong>{formatWeekdayDate(night.date)}</strong>
                  <span>
                    Occupancy {formatPercent(night.occupancy)}
                    {night.occupancyTarget !== null && ` · target ${formatPercent(night.occupancyTarget)}`}
                  </span>
                  <span>Last year {formatPercent(night.occupancyLastYear)}</span>
                  {cancelledBlock && (
                    <strong>
                      {cancelledBlock.name} cancelled ({formatCount(cancelledBlock.roomsPerNight)} rooms)
                    </strong>
                  )}
                </ChartTooltip>
              )}
            </button>
          );
        })}
      </div>
      <div className="column-chart__labels" style={{ gridTemplateColumns: `repeat(${nights.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {nights.map((night) => (
          <span
            key={night.date}
            className={joinClassNames(
              visibleLayers.cancelledBlock && isNightInCancelledBlock(night.date, overview.groupBlocks) && 'column-chart__label--alert',
            )}
          >
            {dayOfMonth(night.date)}
          </span>
        ))}
      </div>

      {selectedNight ? (
        <InvestigationPanel
          selection={{
            kind: 'occupancy_night',
            date: selectedNight.date,
            occupancy: selectedNight.occupancy,
            target: selectedNight.occupancyTarget ?? periodTarget,
            lastYear: selectedNight.occupancyLastYear,
            cancelledBlockName: isNightInCancelledBlock(selectedNight.date, overview.groupBlocks)?.name ?? null,
          }}
          options={actionOptions}
          source={`Daily results, ${formatPeriodLabel(overview.period)}`}
          onAction={onAction}
          onClose={clearSelection}
        />
      ) : (
        <p className="explore-view__note">Daily occupancy, {formatPeriodLabel(overview.period)}. Select a night to investigate it.</p>
      )}
    </div>
  );
}
