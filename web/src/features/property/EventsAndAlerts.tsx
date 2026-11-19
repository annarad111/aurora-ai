import type { InvestigationContext, PropertyEvent } from '@aurora/shared';
import { useState } from 'react';
import { ArrowRightIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import { formatWeekdayDate } from '../../lib/dates';
import type { RoomStatus } from './room-inventory';

const TYPE_LABELS: Record<PropertyEvent['type'], string> = {
  maintenance: 'Maintenance',
  group_arrival: 'Group arrival',
  group_cancellation: 'Group cancellation',
};

function statusOf(event: PropertyEvent): { label: string; modifier: string } {
  if (event.type === 'group_cancellation') return { label: 'Cancelled', modifier: 'cancelled' };
  if (event.status === 'in_progress') return { label: 'In progress', modifier: 'in-progress' };
  if (event.status === 'scheduled') return { label: 'Scheduled', modifier: 'scheduled' };
  return { label: 'Completed', modifier: 'completed' };
}

function titleOf(event: PropertyEvent): string {
  if (event.type === 'maintenance') return `${event.roomNumbers.length === 1 ? 'Room' : 'Rooms'} ${event.roomNumbers.join(', ')}: ${event.reason}`;
  return event.name;
}

function nightsOf(event: PropertyEvent): string {
  return event.firstNight === event.lastNight ? formatWeekdayDate(event.firstNight) : `${formatWeekdayDate(event.firstNight)} – ${formatWeekdayDate(event.lastNight)}`;
}

/** The measured impact in one line, or what is known when it cannot be measured. */
function impactOf(event: PropertyEvent): string {
  if (event.type === 'group_arrival') return `${event.roomsPerNight} rooms a night · ${event.roomNights} room nights on the books`;
  if (event.type === 'group_cancellation') return `${event.roomsPerNight} rooms a night · ${event.roomNights} room nights lost`;
  const { impact } = event;
  if (impact.nights.length === 0) return `${impact.roomNights} room nights unsellable · impact not measurable yet`;
  return impact.nightsFull === 0
    ? `${impact.roomNights} room nights unsellable · no lost sales: never a full night`
    : `${impact.roomNights} room nights unsellable · ${impact.nightsFull} full nights, sales may be lost`;
}

interface EventsAndAlertsProps {
  events: PropertyEvent[];
  onInvestigate: (question: string, context?: InvestigationContext) => void;
  onShowRooms: (status: RoomStatus) => void;
  onShowEvidence: (event: PropertyEvent) => void;
}

/**
 * Maintenance, group arrivals and cancellations, running work first. Each event
 * opens in place with its details, its measured impact and ways to look further.
 */
export function EventsAndAlerts({ events, onInvestigate, onShowRooms, onShowEvidence }: EventsAndAlertsProps) {
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  if (events.length === 0) {
    return <p className="property-empty">No maintenance, group arrivals or cancellations around today.</p>;
  }

  return (
    <ul className="property-events">
      {events.map((event) => {
        const isOpen = openEventId === event.id;
        const status = statusOf(event);
        const detailsId = `event-details-${event.id.replace(/[^a-z0-9-]/gi, '-')}`;
        return (
          <li key={event.id} className={joinClassNames('property-event', `property-event--${event.type}`, isOpen && 'property-event--open')}>
            <button
              type="button"
              className="property-event__summary"
              aria-expanded={isOpen}
              aria-controls={detailsId}
              onClick={() => setOpenEventId((current) => (current === event.id ? null : event.id))}
            >
              <span className="property-event__tags">
                <span className="property-event__type">{TYPE_LABELS[event.type]}</span>
                <span className={`property-event__status property-event__status--${status.modifier}`}>{status.label}</span>
              </span>
              <span className="property-event__title">{titleOf(event)}</span>
              <span className="property-event__nights">{nightsOf(event)}</span>
              <span className="property-event__impact">{impactOf(event)}</span>
            </button>

            {isOpen && (
              <div id={detailsId} className="property-event__details">
                <EventDetails event={event} />
                <div className="property-event__actions">
                  <EventActions event={event} onInvestigate={onInvestigate} onShowRooms={onShowRooms} />
                  <button type="button" className="text-button" onClick={() => onShowEvidence(event)}>
                    View evidence
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EventDetails({ event }: { event: PropertyEvent }) {
  if (event.type === 'maintenance') {
    const tightest = event.impact.fewestVacant;
    return (
      <dl className="property-event__facts">
        <div>
          <dt>Issue</dt>
          <dd>{event.description}</dd>
        </div>
        <div>
          <dt>Room type</dt>
          <dd>{event.roomTypeNames.join(', ')}</dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>
            {event.kind === 'out_of_order' ? 'Out of order: not for sale' : 'Out of service: held back'} · back on {formatWeekdayDate(event.backOn)}
          </dd>
        </div>
        <div>
          <dt>Measured impact</dt>
          <dd>
            {event.impact.nights.length === 0
              ? 'No data yet for these nights.'
              : `${event.impact.nightsFull === 0 ? 'The hotel was never full on these nights' : `${event.impact.nightsFull} nights were full`}${
                  tightest ? `; the tightest night (${formatWeekdayDate(tightest.date)}) had ${tightest.rooms} rooms vacant` : ''
                }${event.impact.nights.some((night) => night.basis === 'on_the_books') ? '. Future nights use the bookings so far.' : '.'}`}
          </dd>
        </div>
      </dl>
    );
  }
  return (
    <dl className="property-event__facts">
      <div>
        <dt>Segment</dt>
        <dd>{event.segment.toUpperCase() === 'MICE' ? 'MICE (meetings and events)' : event.segment}</dd>
      </div>
      <div>
        <dt>Rooms</dt>
        <dd>
          {event.roomsPerNight} a night, {event.roomNights} room nights
        </dd>
      </div>
      {event.type === 'group_cancellation' && (
        <div>
          <dt>Cancelled on</dt>
          <dd>{formatWeekdayDate(event.cancelledOn)}</dd>
        </div>
      )}
    </dl>
  );
}

function EventActions({
  event,
  onInvestigate,
  onShowRooms,
}: {
  event: PropertyEvent;
  onInvestigate: EventsAndAlertsProps['onInvestigate'];
  onShowRooms: EventsAndAlertsProps['onShowRooms'];
}) {
  const nights = { from: event.firstNight, to: event.lastNight };
  if (event.type === 'maintenance') {
    const rooms = event.roomNumbers.join(' and ');
    return (
      <>
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            onInvestigate(`Did the ${event.reason.toLowerCase()} in room ${rooms} cost us sales?`, {
              origin: 'property',
              intent: 'maintenance_impact',
              interaction: 'investigate',
              eventId: event.id,
              roomNumbers: event.roomNumbers,
              dateRange: nights,
            })
          }
        >
          Investigate revenue impact <ArrowRightIcon />
        </button>
        {event.status === 'in_progress' && (
          <button type="button" className="secondary-button" onClick={() => onShowRooms(event.kind)}>
            Show in room inventory
          </button>
        )}
      </>
    );
  }
  if (event.type === 'group_arrival') {
    return (
      <button
        type="button"
        className="primary-button"
        onClick={() =>
          onInvestigate(`How are bookings for ${nightsOf(event)} pacing, with the ${event.name}?`, {
            origin: 'property',
            intent: 'booking_pace',
            interaction: 'investigate',
            dateRange: nights,
          })
        }
      >
        Check pace for these nights <ArrowRightIcon />
      </button>
    );
  }
  return (
    <button
      type="button"
      className="primary-button"
      onClick={() =>
        onInvestigate(`What did the cancelled ${event.name} cost us?`, {
          origin: 'property',
          intent: 'revenue_gap',
          interaction: 'investigate',
          metric: 'room_revenue',
          segment: 'mice',
          dateRange: nights,
        })
      }
    >
      Investigate the revenue impact <ArrowRightIcon />
    </button>
  );
}
