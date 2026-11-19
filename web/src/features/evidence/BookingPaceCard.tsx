import { formatCount, formatPercent, formatPeriodLabel, type BookingPaceOutput } from '@aurora/shared';
import { joinClassNames } from '../../lib/class-names';
import { STATUS_DISPLAY } from '../../lib/metric-display';
import { formatWeekdayDate, dayOfMonth } from '../../lib/dates';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';
import { InvestigationPanel } from '../investigation/InvestigationPanel';
import type { ActionOptions, InvestigationAction } from '../investigation/investigation-actions';
import { useColumnSelection } from '../investigation/useColumnSelection';
import { ExpandButton } from './ExpandButton';
import { useDrawOnMount } from './useDrawOnMount';

interface BookingPaceCardProps {
  pace: BookingPaceOutput;
  interaction: FactInteraction;
  onShowProvenance: (factId: string) => void;
  onExpand: () => void;
  actionOptions: ActionOptions;
  onAction: (action: InvestigationAction) => void;
}

/**
 * Rooms on the books for the coming nights vs the same point last year, in
 * total and per stay date. Each stay date can be selected to investigate it.
 */
export function BookingPaceCard({ pace, interaction, onShowProvenance, onExpand, actionOptions, onAction }: BookingPaceCardProps) {
  const { selectedIndex, clearSelection, columnProps } = useColumnSelection(pace.stayDates.length);
  const selectedDay = selectedIndex === null ? null : pace.stayDates[selectedIndex];
  const tallestNight = Math.max(...pace.stayDates.flatMap((day) => [day.roomsOnTheBooks, day.roomsOnTheBooksLastYear]), 1);
  const isDrawn = useDrawOnMount();
  const isHighlighted = ['booking_pace', 'pace_pickup'].some((factId) => isFactHighlighted(factId, interaction.activeFactId));
  const status = STATUS_DISPLAY[pace.status];
  const longestBar = Math.max(pace.roomsOnTheBooks, pace.roomsOnTheBooksLastYear, 1);
  const barWidth = (rooms: number) => (isDrawn ? `${(rooms / longestBar) * 100}%` : '0%');
  const stayLabel = formatPeriodLabel({ from: pace.stayFrom, to: pace.stayTo }).replace(/ \d{4}$/, '');

  return (
    <section
      className={joinClassNames('evidence-card', isHighlighted && 'evidence-card--highlighted')}
      aria-label="Booking pace"
      onMouseEnter={() => interaction.hoverFact('booking_pace')}
      onMouseLeave={() => interaction.hoverFact(null)}
    >
      <header className="evidence-card__header">
        <span className="evidence-card__title-with-badge">
          <span className="evidence-card__title">Pace, {stayLabel}</span>
          <span className={`status-badge status-badge--${status.modifier}`}>
            <span aria-hidden="true">{status.icon}</span>
            {status.label}
          </span>
        </span>
        <ExpandButton chartName="pace" onExpand={onExpand} />
      </header>

      <div className="booking-pace__rows">
        <span className="booking-pace__label">On books</span>
        <span className="booking-pace__track">
          <span className="booking-pace__bar booking-pace__bar--on-the-books" style={{ width: barWidth(pace.roomsOnTheBooks) }} />
        </span>
        <span className="booking-pace__value">{formatCount(pace.roomsOnTheBooks)}</span>

        <span className="booking-pace__label">Last year</span>
        <span className="booking-pace__track">
          <span className="booking-pace__bar booking-pace__bar--last-year" style={{ width: barWidth(pace.roomsOnTheBooksLastYear) }} />
        </span>
        <span className="booking-pace__value">{formatCount(pace.roomsOnTheBooksLastYear)}</span>
      </div>

      {pace.stayDates.length > 1 && (
        <div className="pace-nights">
          <span className="pace-nights__caption">Per night: select one to investigate</span>
          <div
            className="pace-nights__columns"
            style={{ gridTemplateColumns: `repeat(${pace.stayDates.length}, minmax(0, 1fr))` }}
            role="group"
            aria-label="Bookings per stay date. Use the arrow keys to move and Enter to select a night."
          >
            {pace.stayDates.map((day, index) => {
              const isBehind = day.roomsOnTheBooks < day.roomsOnTheBooksLastYear;
              return (
                <button
                  key={day.stayDate}
                  type="button"
                  className={joinClassNames(
                    'pace-nights__column',
                    isBehind && 'pace-nights__column--behind',
                    selectedIndex === index && 'pace-nights__column--selected',
                    selectedIndex !== null && selectedIndex !== index && 'pace-nights__column--dimmed',
                  )}
                  title={`${formatWeekdayDate(day.stayDate)}: ${formatCount(day.roomsOnTheBooks)} on the books, ${formatCount(day.roomsOnTheBooksLastYear)} last year`}
                  aria-label={`${formatWeekdayDate(day.stayDate)}: ${formatCount(day.roomsOnTheBooks)} room nights on the books, ${formatCount(day.roomsOnTheBooksLastYear)} last year`}
                  {...columnProps(index)}
                >
                  <span className="pace-nights__plot">
                    <span className="pace-nights__bar" style={{ height: isDrawn ? `${(day.roomsOnTheBooks / tallestNight) * 100}%` : '0%' }} />
                    <span className="pace-nights__last-year" style={{ bottom: `${(day.roomsOnTheBooksLastYear / tallestNight) * 100}%` }} />
                  </span>
                  <span className="pace-nights__day">{dayOfMonth(day.stayDate)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedDay && (
        <InvestigationPanel
          selection={{ kind: 'pace_night', date: selectedDay.stayDate, roomsOnTheBooks: selectedDay.roomsOnTheBooks, roomsOnTheBooksLastYear: selectedDay.roomsOnTheBooksLastYear }}
          options={actionOptions}
          source={`Bookings on the books, counted ${formatWeekdayDate(pace.snapshotDate)}`}
          onAction={onAction}
          onClose={clearSelection}
        />
      )}

      <button type="button" className="evidence-card__link" onClick={() => onShowProvenance('booking_pace')}>
        Room nights, same point last year: {formatPercent(pace.changeVsLastYear, { decimals: 0, signDisplay: 'always' })}
      </button>
    </section>
  );
}
