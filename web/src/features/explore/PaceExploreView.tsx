import { formatCount, formatPercent, formatPeriodLabel, type BookingPaceOutput } from '@aurora/shared';
import { useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { dayOfMonth, formatWeekdayDate } from '../../lib/dates';
import { InvestigationPanel } from '../investigation/InvestigationPanel';
import type { ActionOptions, InvestigationAction } from '../investigation/investigation-actions';
import { useColumnSelection } from '../investigation/useColumnSelection';
import { ChartTooltip } from './ChartTooltip';

interface PaceExploreViewProps {
  pace: BookingPaceOutput;
  /** Rooms in the hotel: the height of a full bar. Falls back to the largest value. */
  roomCount: number | null;
  actionOptions: ActionOptions;
  onAction: (action: InvestigationAction) => void;
}

/** Rooms on the books per stay date, next to the same point last year. */
export function PaceExploreView({ pace, roomCount, actionOptions, onAction }: PaceExploreViewProps) {
  const [hoveredDateIndex, setHoveredDateIndex] = useState<number | null>(null);
  const { selectedIndex, focusedIndex, clearSelection, columnProps } = useColumnSelection(pace.stayDates.length);
  const selectedDay = selectedIndex === null ? null : pace.stayDates[selectedIndex];
  const tooltipIndex = hoveredDateIndex ?? focusedIndex;
  const highlightedIndex = hoveredDateIndex ?? selectedIndex;
  const capacity = roomCount ?? Math.max(...pace.stayDates.flatMap((day) => [day.roomsOnTheBooks, day.roomsOnTheBooksLastYear]), 1);
  const heightOf = (rooms: number) => `${(rooms / capacity) * 100}%`;
  const columnTemplate = { gridTemplateColumns: `repeat(${pace.stayDates.length}, minmax(0, 1fr))` };

  return (
    <div className="explore-view">
      <div className="chart-legend">
        <span className="chart-legend__item">
          <span className="chart-legend__swatch chart-legend__swatch--primary" aria-hidden="true" />
          On the books today
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__swatch chart-legend__swatch--reference" aria-hidden="true" />
          Same point last year
        </span>
      </div>

      <div
        className="column-chart column-chart--pace column-chart--selectable"
        style={columnTemplate}
        role="group"
        aria-label="Bookings by stay date. Use the arrow keys to move and Enter to select a night."
      >
        {pace.stayDates.map((day, dateIndex) => {
          const difference = day.roomsOnTheBooks - day.roomsOnTheBooksLastYear;
          const isSelected = selectedIndex === dateIndex;
          return (
            <button
              key={day.stayDate}
              type="button"
              className={joinClassNames('column-chart__column column-chart__column--paired', isSelected && 'column-chart__column--selected')}
              aria-label={`${formatWeekdayDate(day.stayDate)}: ${formatCount(day.roomsOnTheBooks)} room nights on the books, ${formatCount(day.roomsOnTheBooksLastYear)} last year`}
              onMouseEnter={() => setHoveredDateIndex(dateIndex)}
              onMouseLeave={() => setHoveredDateIndex(null)}
              {...columnProps(dateIndex)}
            >
              <span
                className={joinClassNames(
                  'column-chart__bar column-chart__bar--primary column-chart__bar--half',
                  highlightedIndex !== null && highlightedIndex !== dateIndex && !isSelected && 'column-chart__bar--dimmed',
                )}
                style={{ height: heightOf(day.roomsOnTheBooks) }}
              />
              <span className="column-chart__bar column-chart__bar--reference column-chart__bar--half" style={{ height: heightOf(day.roomsOnTheBooksLastYear) }} />
              {tooltipIndex === dateIndex && (
                <ChartTooltip
                  columnIndex={dateIndex}
                  columnCount={pace.stayDates.length}
                  bottom={`calc(${heightOf(Math.max(day.roomsOnTheBooks, day.roomsOnTheBooksLastYear))} + 10px)`}
                >
                  <strong>{formatWeekdayDate(day.stayDate)}</strong>
                  <span>
                    On books {formatCount(day.roomsOnTheBooks)} · last year {formatCount(day.roomsOnTheBooksLastYear)}
                  </span>
                  <span>
                    {formatCount(difference, { signDisplay: 'always' })} room nights (
                    {formatPercent(day.roomsOnTheBooksLastYear === 0 ? 0 : difference / day.roomsOnTheBooksLastYear, { decimals: 0, signDisplay: 'always' })})
                  </span>
                </ChartTooltip>
              )}
            </button>
          );
        })}
      </div>
      <div className="column-chart__labels" style={columnTemplate} aria-hidden="true">
        {pace.stayDates.map((day) => (
          <span key={day.stayDate}>{dayOfMonth(day.stayDate)}</span>
        ))}
      </div>

      {selectedDay && (
        <InvestigationPanel
          selection={{ kind: 'pace_night', date: selectedDay.stayDate, roomsOnTheBooks: selectedDay.roomsOnTheBooks, roomsOnTheBooksLastYear: selectedDay.roomsOnTheBooksLastYear }}
          options={actionOptions}
          source={`Bookings on the books, counted ${formatWeekdayDate(pace.snapshotDate)}`}
          onAction={onAction}
          onClose={clearSelection}
        />
      )}

      <p className="explore-view__note">
        Room nights on the books for stay dates {formatPeriodLabel({ from: pace.stayFrom, to: pace.stayTo })}
        {roomCount !== null && `. Capacity ${formatCount(roomCount)} per night`}.
      </p>
    </div>
  );
}
