import type { GetPropertyStatusOutput, InvestigationContext } from '@aurora/shared';
import { useState } from 'react';
import { ArrowRightIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import { formatWeekdayDate } from '../../lib/dates';
import { formatMetricValue } from '../../lib/metric-display';
import { ROOM_STATUS_DEFINITIONS, ROOM_STATUS_LABELS, roomsWithStatus, splitInventory, type RoomStatus } from './room-inventory';

interface OperationsTonightProps {
  status: GetPropertyStatusOutput;
  onInvestigate: (question: string, context?: InvestigationContext) => void;
}

/**
 * The rooms tonight: four statuses that add up to the physical rooms, as one
 * stacked bar. Selecting a status shows what is behind it (and, for rooms that
 * cannot be sold, which rooms and why), with a way to ask Aurora about it.
 */
export function OperationsTonight({ status, onInvestigate }: OperationsTonightProps) {
  const [selected, setSelected] = useState<RoomStatus | null>(null);
  const { inventory } = status;
  const segments = splitInventory(inventory);
  const night = formatWeekdayDate(status.date);

  return (
    <div className="operations-tonight">
      <dl className="operations-tonight__stats">
        <div className="property-stat">
          <dt>Physical rooms</dt>
          <dd>{inventory.physicalRooms}</dd>
        </div>
        <div className="property-stat">
          <dt>Occupied</dt>
          <dd>
            {inventory.occupied} <span className="property-stat__note">{formatMetricValue('occupancy', inventory.occupancyOfPhysical)}</span>
          </dd>
        </div>
        <div className="property-stat property-stat--strong">
          <dt>Vacant & available</dt>
          <dd>{inventory.vacantAvailable}</dd>
        </div>
        <div className="property-stat">
          <dt>Out of order</dt>
          <dd>{inventory.outOfOrder}</dd>
        </div>
        <div className="property-stat">
          <dt>Out of service</dt>
          <dd>{inventory.outOfService}</dd>
        </div>
        <div className="property-stat property-stat--unavailable">
          <dt>Arrivals / departures</dt>
          <dd>
            <span className="property-stat__note">Not in the data: Aurora has rooms sold per night, not reservations.</span>
          </dd>
        </div>
      </dl>

      <div className="room-inventory">
        <div className="room-inventory__bar" role="group" aria-label={`Room inventory for ${night}. Select a status to see its rooms.`}>
          {segments.map((segment) => (
            <button
              key={segment.status}
              type="button"
              className={joinClassNames(
                'room-inventory__segment',
                `room-inventory__segment--${segment.status}`,
                selected === segment.status && 'room-inventory__segment--selected',
                selected !== null && selected !== segment.status && 'room-inventory__segment--dimmed',
              )}
              // Even a status with no rooms keeps a sliver, so it can be selected and read.
              style={{ flexGrow: Math.max(segment.share, 0.012) }}
              aria-pressed={selected === segment.status}
              aria-label={`${ROOM_STATUS_LABELS[segment.status]}: ${segment.rooms} rooms`}
              onClick={() => setSelected((current) => (current === segment.status ? null : segment.status))}
            >
              {segment.share >= 0.08 && <span className="room-inventory__count">{segment.rooms}</span>}
            </button>
          ))}
        </div>
        <ul className="room-inventory__legend">
          {segments.map((segment) => (
            <li key={segment.status}>
              <span className={`room-inventory__swatch room-inventory__swatch--${segment.status}`} aria-hidden="true" />
              {ROOM_STATUS_LABELS[segment.status]} <strong>{segment.rooms}</strong>
            </li>
          ))}
        </ul>
        <p className="room-inventory__sum">
          {inventory.occupied} occupied + {inventory.vacantAvailable} vacant + {inventory.outOfOrder} out of order + {inventory.outOfService} out of service ={' '}
          {inventory.physicalRooms} rooms
        </p>
      </div>

      {selected && <StatusDetail status={status} selected={selected} onClose={() => setSelected(null)} onInvestigate={onInvestigate} />}
    </div>
  );
}

function StatusDetail({
  status,
  selected,
  onClose,
  onInvestigate,
}: {
  status: GetPropertyStatusOutput;
  selected: RoomStatus;
  onClose: () => void;
  onInvestigate: OperationsTonightProps['onInvestigate'];
}) {
  const { inventory } = status;
  const rooms = roomsWithStatus(status.unavailableRooms, selected);
  const night = formatWeekdayDate(status.date);
  const tonight = { from: status.date, to: status.date };

  return (
    <section className="investigation-panel room-status-detail" aria-label={`${ROOM_STATUS_LABELS[selected]} rooms`} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <header className="investigation-panel__header">
        <span className="investigation-panel__titles">
          <span className="investigation-panel__eyebrow">{night}</span>
          <h3 className="investigation-panel__title">{ROOM_STATUS_LABELS[selected]}</h3>
        </span>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="investigation-panel__note">{ROOM_STATUS_DEFINITIONS[selected]}</p>

      {selected === 'occupied' && (
        <>
          <dl className="investigation-panel__figures">
            <div className="investigation-panel__figure">
              <dt>Rooms occupied</dt>
              <dd>
                <span className="investigation-panel__value">{inventory.occupied}</span>
              </dd>
            </div>
            <div className="investigation-panel__figure">
              <dt>Of all rooms</dt>
              <dd>
                <span className="investigation-panel__value">{formatMetricValue('occupancy', inventory.occupancyOfPhysical)}</span>
              </dd>
            </div>
            <div className="investigation-panel__figure">
              <dt>Of sellable rooms</dt>
              <dd>
                <span className="investigation-panel__value">{formatMetricValue('occupancy', inventory.occupancyOfSellable)}</span>
              </dd>
            </div>
          </dl>
          <div className="investigation-panel__actions">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                onInvestigate(`Who is staying with us tonight, by segment?`, {
                  origin: 'property',
                  intent: 'data_question',
                  interaction: 'explain',
                  metric: 'occupancy',
                  breakdown: 'segment',
                  date: status.date,
                  dateRange: tonight,
                  selectedValue: inventory.occupancyOfPhysical,
                })
              }
            >
              Explain tonight’s occupancy <ArrowRightIcon />
            </button>
          </div>
        </>
      )}

      {selected === 'vacant' && (
        <>
          <dl className="investigation-panel__figures">
            <div className="investigation-panel__figure">
              <dt>Vacant & available</dt>
              <dd>
                <span className="investigation-panel__value">{inventory.vacantAvailable}</span>
              </dd>
            </div>
            <div className="investigation-panel__figure">
              <dt>Sellable rooms</dt>
              <dd>
                <span className="investigation-panel__value">{inventory.sellableRooms}</span>
              </dd>
            </div>
          </dl>
          <div className="investigation-panel__actions">
            <button type="button" className="primary-button" onClick={() => onInvestigate('Are we on pace for the rest of the month?')}>
              Check bookings for the coming nights <ArrowRightIcon />
            </button>
          </div>
        </>
      )}

      {(selected === 'out_of_order' || selected === 'out_of_service') && (
        <>
          {rooms.length === 0 ? (
            <p className="investigation-panel__note">No rooms are {ROOM_STATUS_LABELS[selected].toLowerCase()} tonight.</p>
          ) : (
            <ul className="unavailable-rooms">
              {rooms.map((room) => (
                <li key={room.id} className="unavailable-room">
                  <span className="unavailable-room__number">Room {room.roomNumber}</span>
                  <span className="unavailable-room__type">{room.roomTypeName}</span>
                  <span className="unavailable-room__reason">{room.reason}</span>
                  <span className="unavailable-room__dates">
                    {formatWeekdayDate(room.firstNight)} – {formatWeekdayDate(room.lastNight)} · back on {formatWeekdayDate(room.backOn)}
                  </span>
                  <span className="unavailable-room__description">{room.description}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="investigation-panel__actions">
            <button type="button" className="primary-button" onClick={() => onInvestigate('Which rooms are out of order?')}>
              Ask Aurora about these rooms <ArrowRightIcon />
            </button>
          </div>
        </>
      )}

      <p className="investigation-panel__source">
        <span aria-hidden="true">✓</span>{' '}
        {status.basis === 'results' ? `Rooms sold on ${night}` : `Bookings on the books as of ${formatWeekdayDate(status.asOf)}`}; room numbers and maintenance are demo data.
      </p>
    </section>
  );
}
