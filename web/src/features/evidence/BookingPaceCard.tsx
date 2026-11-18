import { formatCount, formatPercent, formatPeriodLabel, type BookingPaceOutput } from '@aurora/shared';
import { joinClassNames } from '../../lib/class-names';
import { STATUS_DISPLAY } from '../../lib/metric-display';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';
import { useDrawOnMount } from './useDrawOnMount';

interface BookingPaceCardProps {
  pace: BookingPaceOutput;
  interaction: FactInteraction;
  onShowProvenance: (factId: string) => void;
}

/** Rooms on the books for the rest of the month vs the same point last year. */
export function BookingPaceCard({ pace, interaction, onShowProvenance }: BookingPaceCardProps) {
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

      <button type="button" className="evidence-card__link" onClick={() => onShowProvenance('booking_pace')}>
        Room nights, same point last year: {formatPercent(pace.changeVsLastYear, { decimals: 0, signDisplay: 'always' })}
      </button>
    </section>
  );
}
