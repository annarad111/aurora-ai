import { addDays } from '@aurora/analytics';
import { formatCount, formatPercent, type GetPropertyStatusOutput, type IsoDate, type TrailStage, type UnavailableRoom } from '@aurora/shared';
import { describeDate } from './derived-facts';
import { parsePeriod } from './question-parser';

// ---------------------------------------------------------------------------
// Questions about the property itself ("how many rooms are available?", "which
// rooms are out of order?", "how many rooms does the hotel have?"), answered
// from get_property_status by fixed rules. Every answer ends with a button to
// the part of the Property Overview where the same numbers are shown.
// ---------------------------------------------------------------------------

export type PropertyQuestionKind = 'inventory' | 'maintenance' | 'profile' | 'arrivals';

export interface PropertyFocus {
  kind: PropertyQuestionKind;
  /** The night asked about; today when none is named. */
  date?: IsoDate;
}

const ROOM_STATE = /\b(available|availability|free|vacant|empty|left|unsold|occupied|occupancy tonight|sellable|unavailable|blocked)\b/i;
const MAINTENANCE = /\b(out[- ]of[- ](order|service)|ooo|oos|maintenance|broken|repairs?|under repair)\b/i;
const PROFILE = /\b(how many rooms (does|do|has|is) (the )?(hotel|property|we|it)|room types?|room categories|total (number of )?rooms|rooms in total|property (details|profile|info)|suites?)\b/i;
const ARRIVALS = /\b(arrivals?|departures?|check-?ins?|check-?outs?|arriving|departing)\b/i;
/** Questions about sales over a period belong to the data questions, not to tonight's rooms. */
const SALES_PERIOD = /\b(sold|sell|revenue|adr|revpar|pace|pick-?up|last (week|month|year)|this (week|month|year)|yesterday|budget|target)\b/i;

export function parsePropertyQuestion(question: string, today: IsoDate): PropertyFocus | null {
  const mentionsRooms = /\brooms?\b/i.test(question);
  let kind: PropertyQuestionKind | null = null;
  if (MAINTENANCE.test(question)) kind = 'maintenance';
  else if (ARRIVALS.test(question)) kind = 'arrivals';
  else if (PROFILE.test(question)) kind = 'profile';
  else if (mentionsRooms && ROOM_STATE.test(question) && !SALES_PERIOD.test(question)) kind = 'inventory';
  if (!kind) return null;

  const date = parseNight(question, today);
  return { kind, ...(date ? { date } : {}) };
}

/** One night: "tonight", "tomorrow", or a single date ("on 24 November"). A longer period is not one night. */
function parseNight(question: string, today: IsoDate): IsoDate | undefined {
  if (/\btomorrow\b/i.test(question)) return addDays(today, 1);
  if (/\b(tonight|today|now|right now|currently)\b/i.test(question)) return today;
  const period = parsePeriod(question, today);
  return period && period.from === period.to ? period.from : undefined;
}

// --- Writing the answer ---------------------------------------------------------------

function roomList(rooms: UnavailableRoom[]): string {
  return rooms.map((room) => `room ${room.roomNumber} (${room.reason.toLowerCase()}, back on ${describeDate(room.backOn)})`).join(', ');
}

function nightWords(status: GetPropertyStatusOutput, today: IsoDate): string {
  if (status.date === today) return `tonight (${describeDate(status.date)})`;
  return `on ${describeDate(status.date)}`;
}

export interface PropertyAnswer {
  headline: string;
  text: string;
  trail: TrailStage[];
  followups: string[];
  contextText: string;
}

export function writePropertyAnswer(status: GetPropertyStatusOutput, focus: PropertyFocus, today: IsoDate): PropertyAnswer {
  const { inventory } = status;
  const night = nightWords(status, today);
  const isFuture = status.basis === 'on_the_books';
  const outOfOrder = status.unavailableRooms.filter((room) => room.kind === 'out_of_order');
  const outOfService = status.unavailableRooms.filter((room) => room.kind === 'out_of_service');
  const occupiedWords = isFuture
    ? `${formatCount(inventory.occupied)} are booked so far (as of ${describeDate(status.asOf)})`
    : `${formatCount(inventory.occupied)} ${status.date === today ? 'are' : 'were'} occupied (${formatPercent(inventory.occupancyOfPhysical)})`;
  const unavailableWords = [
    inventory.outOfOrder > 0 ? `${formatCount(inventory.outOfOrder)} out of order` : null,
    inventory.outOfService > 0 ? `${formatCount(inventory.outOfService)} out of service` : null,
  ].filter((part): part is string => part !== null);
  const breakdown = `Of the hotel's ${formatCount(inventory.physicalRooms)} rooms, ${occupiedWords}${
    unavailableWords.length > 0 ? `, ${unavailableWords.join(' and ')}` : ''
  }, which leaves ${formatCount(inventory.vacantAvailable)} vacant and available${isFuture ? ' to sell' : ''}.`;
  const whyUnavailable = [
    outOfOrder.length > 0 ? `Out of order: ${roomList(outOfOrder)}.` : '',
    outOfService.length > 0 ? `Out of service: ${roomList(outOfService)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const demoNote = status.profile?.isDemoData ? ' Room numbers and maintenance are demo data.' : '';

  const inventoryTrail: TrailStage[] = [
    {
      stage: 'observation',
      text: isFuture
        ? `${formatCount(inventory.occupied)} of ${formatCount(inventory.physicalRooms)} rooms are booked so far for ${describeDate(status.date)}.`
        : `${formatCount(inventory.occupied)} of ${formatCount(inventory.physicalRooms)} rooms ${status.date === today ? 'are' : 'were'} occupied ${night}.`,
      factId: 'property_rooms',
    },
  ];
  if (status.unavailableRooms.length > 0) {
    inventoryTrail.push({
      stage: 'discovery',
      text: `${formatCount(status.unavailableRooms.length)} ${status.unavailableRooms.length === 1 ? 'room cannot' : 'rooms cannot'} be sold because of maintenance.`,
    });
  }
  inventoryTrail.push({
    stage: 'understanding',
    text: `${formatCount(inventory.sellableRooms)} rooms can be sold, ${formatCount(inventory.vacantAvailable)} of them ${isFuture ? 'are still free' : 'are vacant'}.`,
  });
  const openInventory: TrailStage = {
    stage: 'decision',
    text: 'See every room status, and why a room cannot be sold, in the property overview.',
    action: { kind: 'navigate', label: 'See the room inventory', destination: 'property', section: 'inventory' },
  };

  const nextNight = addDays(status.date, 1);
  const followups = [
    focus.kind !== 'maintenance' ? 'Which rooms are out of order?' : `How many rooms are available on ${describeDate(nextNight)}?`,
    focus.kind === 'maintenance' ? 'How many rooms are available tonight?' : `How many rooms are available on ${describeDate(nextNight)}?`,
    'Are we on pace for the rest of the month?',
  ];
  const contextText = `${breakdown} ${whyUnavailable}`.trim();

  switch (focus.kind) {
    case 'profile': {
      const types = status.profile?.roomTypes ?? [];
      const typeWords = types.map((type) => `${formatCount(type.count)} × ${type.name}`);
      const typeSentence = typeWords.length > 1 ? `${typeWords.slice(0, -1).join(', ')} and ${typeWords.at(-1)}` : (typeWords[0] ?? '');
      return {
        headline: `${status.hotel.name} has ${formatCount(inventory.physicalRooms)} rooms.`,
        text: `${status.hotel.name} is ${status.profile ? `an ${status.profile.propertyType.toLowerCase()} in ${status.hotel.city}, ${status.profile.country}` : `in ${status.hotel.city}`}, with ${formatCount(inventory.physicalRooms)} rooms${typeSentence ? `: ${typeSentence}` : ''}. ${breakdown}${demoNote}`,
        trail: [
          { stage: 'observation', text: `${formatCount(inventory.physicalRooms)} rooms in ${formatCount(types.length)} room types.`, factId: 'property_rooms' },
          ...inventoryTrail.slice(1),
          { ...openInventory, text: 'See the property, its room types and the rooms tonight in the overview.', action: { kind: 'navigate', label: 'See the property', destination: 'property', section: 'identity' } },
        ],
        followups,
        contextText,
      };
    }
    case 'maintenance': {
      const upcoming = status.upcomingRoomEvents;
      const upcomingSentence =
        upcoming.length > 0
          ? ` Coming up: ${upcoming.map((room) => `room ${room.roomNumber} (${room.reason.toLowerCase()}, ${describeDate(room.firstNight)} to ${describeDate(room.lastNight)})`).join(', ')}.`
          : ' No other maintenance is planned in the next 14 days.';
      return {
        headline:
          status.unavailableRooms.length === 0
            ? `No rooms are out of order or out of service ${night}.`
            : `${unavailableWords.join(' and ').replace(/^./, (letter) => letter.toUpperCase())} ${night}.`,
        text: `${whyUnavailable || 'Every room can be sold.'} ${breakdown}${upcomingSentence}${demoNote}`,
        trail: [...inventoryTrail, openInventory],
        followups,
        contextText,
      };
    }
    case 'arrivals':
      return {
        headline: 'Arrivals and departures are not in Aurora’s data.',
        text: `Aurora has the rooms sold per night, not individual reservations, so it cannot count arrivals or departures. What it can tell: ${breakdown.charAt(0).toLowerCase()}${breakdown.slice(1)}${demoNote}`,
        trail: [...inventoryTrail, openInventory],
        followups,
        contextText,
      };
    case 'inventory':
      return {
        headline: isFuture
          ? `${formatCount(inventory.vacantAvailable)} rooms can still be sold for ${describeDate(status.date)}.`
          : `${formatCount(inventory.vacantAvailable)} rooms ${status.date === today ? 'are' : 'were'} vacant and available ${night}.`,
        text: `${breakdown}${whyUnavailable ? ` ${whyUnavailable}` : ''}${demoNote}`,
        trail: [...inventoryTrail, openInventory],
        followups,
        contextText,
      };
  }
}
