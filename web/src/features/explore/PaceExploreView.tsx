import { formatCount, formatPercent, formatPeriodLabel, type BookingPaceOutput } from '@aurora/shared';
import { useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { dayOfMonth, formatWeekdayDate } from '../../lib/dates';
import { ChartTooltip } from './ChartTooltip';

interface PaceExploreViewProps {
  pace: BookingPaceOutput;
  /** Rooms in the hotel: the height of a full bar. Falls back to the largest value. */
  roomCount: number | null;
}

/** Rooms on the books per stay date, next to the same point last year. */
export function PaceExploreView({ pace, roomCount }: PaceExploreViewProps) {
  const [hoveredDateIndex, setHoveredDateIndex] = useState<number | null>(null);
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

      <div className="column-chart column-chart--pace" style={columnTemplate}>
        {pace.stayDates.map((day, dateIndex) => {
          const difference = day.roomsOnTheBooks - day.roomsOnTheBooksLastYear;
          const isHovered = hoveredDateIndex === dateIndex;
          return (
            <div
              key={day.stayDate}
              className="column-chart__column column-chart__column--paired"
              onMouseEnter={() => setHoveredDateIndex(dateIndex)}
              onMouseLeave={() => setHoveredDateIndex(null)}
            >
              <span
                className={joinClassNames(
                  'column-chart__bar column-chart__bar--primary column-chart__bar--half',
                  hoveredDateIndex !== null && !isHovered && 'column-chart__bar--dimmed',
                )}
                style={{ height: heightOf(day.roomsOnTheBooks) }}
              />
              <span className="column-chart__bar column-chart__bar--reference column-chart__bar--half" style={{ height: heightOf(day.roomsOnTheBooksLastYear) }} />
              {isHovered && (
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
            </div>
          );
        })}
      </div>
      <div className="column-chart__labels" style={columnTemplate} aria-hidden="true">
        {pace.stayDates.map((day) => (
          <span key={day.stayDate}>{dayOfMonth(day.stayDate)}</span>
        ))}
      </div>

      <p className="explore-view__note">
        Room nights on the books for stay dates {formatPeriodLabel({ from: pace.stayFrom, to: pace.stayTo })}
        {roomCount !== null && `. Capacity ${formatCount(roomCount)} per night`}.
      </p>
    </div>
  );
}
