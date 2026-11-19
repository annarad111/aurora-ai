import { addDays, listDatesInRange } from '@aurora/analytics';
import type { GetRoomEventsInput, GetRoomEventsOutput, IsoDate, RoomEvent, RoomStatusEvent } from '@aurora/shared';
import { requireHotel, ToolInputError, type ToolContext } from './tool-context';

/** The default window: recent maintenance and what is planned. */
const DAYS_BACK = 14;
const DAYS_AHEAD = 30;

/** Rooms with the same work on the same nights are one event ("Rooms 118, 119: carpet replacement"). */
function groupKey(event: RoomStatusEvent): string {
  return `${event.kind}|${event.reason}|${event.firstNight}|${event.lastNight}`;
}

/**
 * get_room_events: maintenance in a window, and what it did to sales.
 *
 * A room out of order or out of service only costs a sale on a night the hotel
 * is full. So for every night of an event:
 *   vacant = physical rooms − rooms sold (or booked so far) − every room that cannot be sold
 * and the event counts the nights with no vacant room left. Past nights use the
 * results, future nights the bookings on the books (they can still change).
 * Read-only; the maintenance is fictional demo data.
 */
export async function getRoomEvents(input: GetRoomEventsInput, context: ToolContext): Promise<GetRoomEventsOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  const window = { from: input.from ?? addDays(context.today, -DAYS_BACK), to: input.to ?? addDays(context.today, DAYS_AHEAD) };
  if (window.from > window.to) throw new ToolInputError('invalid_input', 'from must not be after to');

  const [rawEvents, rooms, profile] = await Promise.all([
    context.repository.listRoomStatusEvents(hotel.id, window),
    context.repository.listRooms(hotel.id),
    context.repository.findPropertyProfile(hotel.id),
  ]);

  // Group, then keep the events asked for.
  const groups = new Map<string, RoomStatusEvent[]>();
  for (const event of rawEvents) groups.set(groupKey(event), [...(groups.get(groupKey(event)) ?? []), event]);
  const selected = [...groups.values()].filter(
    (group) =>
      (!input.eventId || group.some((event) => event.id === input.eventId) || group.map((event) => event.id).join('+') === input.eventId) &&
      (!input.roomNumber || group.some((event) => event.roomNumber === input.roomNumber)),
  );
  if (selected.length === 0) return { today: context.today, window, events: [] };

  // Every night any selected event covers, read in one go.
  const nights = [...new Set(selected.flatMap((group) => listDatesInRange({ from: group[0]!.firstNight, to: group[0]!.lastNight })))].sort();
  const span = { from: nights[0]!, to: nights.at(-1)! };
  const pastNights = nights.filter((night) => night <= context.today);
  const futureNights = nights.filter((night) => night > context.today);
  const [stats, onTheBooks, allEventsInSpan] = await Promise.all([
    pastNights.length > 0 ? context.repository.listDailyStats(hotel.id, { from: pastNights[0]!, to: pastNights.at(-1)! }) : Promise.resolve([]),
    futureNights.length > 0 ? context.repository.listOnTheBooks(hotel.id, context.today, { from: futureNights[0]!, to: futureNights.at(-1)! }) : Promise.resolve([]),
    context.repository.listRoomStatusEvents(hotel.id, span),
  ]);

  const soldByNight = new Map<IsoDate, number>();
  for (const row of stats) soldByNight.set(row.date, (soldByNight.get(row.date) ?? 0) + row.roomsSold);
  const bookedByNight = new Map<IsoDate, number>();
  for (const row of onTheBooks) bookedByNight.set(row.stayDate, (bookedByNight.get(row.stayDate) ?? 0) + row.roomsOnTheBooks);
  const unavailableOn = (night: IsoDate) =>
    new Set(allEventsInSpan.filter((event) => event.firstNight <= night && event.lastNight >= night).map((event) => event.roomNumber)).size;

  const typeNameByCode = new Map((profile?.roomTypes ?? []).map((type) => [type.code, type.name]));
  const roomTypeName = (roomNumber: string) => {
    const room = rooms.find((candidate) => candidate.roomNumber === roomNumber);
    return room ? (typeNameByCode.get(room.roomTypeCode) ?? room.roomTypeCode) : 'Unknown room type';
  };

  const events: RoomEvent[] = selected.map((group) => {
    const first = group[0]!;
    const eventNights = listDatesInRange({ from: first.firstNight, to: first.lastNight });
    const measured = eventNights.flatMap((night) => {
      const isPast = night <= context.today;
      const occupied = isPast ? soldByNight.get(night) : bookedByNight.get(night);
      if (occupied === undefined) return [];
      const vacantRooms = hotel.roomCount - occupied - unavailableOn(night);
      return [{ date: night, basis: isPast ? ('results' as const) : ('on_the_books' as const), vacantRooms, isFull: vacantRooms <= 0 }];
    });
    const tightest = measured.reduce<(typeof measured)[number] | null>((lowest, night) => (lowest === null || night.vacantRooms < lowest.vacantRooms ? night : lowest), null);
    const status: RoomEvent['status'] = first.lastNight < context.today ? 'completed' : first.firstNight > context.today ? 'scheduled' : 'in_progress';
    return {
      id: group.map((event) => event.id).join('+'),
      roomNumbers: group.map((event) => event.roomNumber),
      roomTypeNames: [...new Set(group.map((event) => roomTypeName(event.roomNumber)))],
      kind: first.kind,
      reason: first.reason,
      description: first.description,
      firstNight: first.firstNight,
      lastNight: first.lastNight,
      backOn: addDays(first.lastNight, 1),
      status,
      impact: {
        roomNights: group.length * eventNights.length,
        nights: measured,
        nightsFull: measured.filter((night) => night.isFull).length,
        fewestVacant: tightest ? { rooms: tightest.vacantRooms, date: tightest.date } : null,
      },
    };
  });

  return { today: context.today, window, events: events.sort((first, second) => first.firstNight.localeCompare(second.firstNight)) };
}
