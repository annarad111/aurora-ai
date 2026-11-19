import { addDays, divideOrZero } from '@aurora/analytics';
import type { GetPropertyStatusInput, GetPropertyStatusOutput, RoomStatusEvent, UnavailableRoom } from '@aurora/shared';
import { requireHotel, ToolInputError, type ToolContext } from './tool-context';

/** How far ahead maintenance and group blocks count as "upcoming". */
const UPCOMING_MAINTENANCE_DAYS = 14;
const UPCOMING_GROUP_DAYS = 30;

/**
 * get_property_status: the rooms of the hotel for one night.
 *
 *   physical  = every room
 *   occupied  = rooms sold that night (results), or booked so far (future night)
 *   out of order / out of service = rooms in a maintenance event that night
 *   vacant & available = physical − occupied − out of order − out of service
 *
 * The four statuses are mutually exclusive and add up to the physical rooms.
 * Read-only; the maintenance and room data are fictional demo data.
 */
export async function getPropertyStatus(input: GetPropertyStatusInput, context: ToolContext): Promise<GetPropertyStatusOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  const date = input.date ?? context.today;
  const night = { from: date, to: date };

  let occupied: number;
  let basis: GetPropertyStatusOutput['basis'];
  if (date <= context.today) {
    const stats = await context.repository.listDailyStats(hotel.id, night);
    if (stats.length === 0) throw new ToolInputError('no_data', `There are no results for the night of ${date}.`);
    occupied = stats.reduce((sum, row) => sum + row.roomsSold, 0);
    basis = 'results';
  } else {
    const onTheBooks = await context.repository.listOnTheBooks(hotel.id, context.today, night);
    if (onTheBooks.length === 0) throw new ToolInputError('no_data', `There are no bookings on the books for the night of ${date}.`);
    occupied = onTheBooks.reduce((sum, row) => sum + row.roomsOnTheBooks, 0);
    basis = 'on_the_books';
  }

  const [profile, rooms, eventsTonight, eventsAhead, groupBlocks] = await Promise.all([
    context.repository.findPropertyProfile(hotel.id),
    context.repository.listRooms(hotel.id),
    context.repository.listRoomStatusEvents(hotel.id, night),
    context.repository.listRoomStatusEvents(hotel.id, { from: addDays(date, 1), to: addDays(date, UPCOMING_MAINTENANCE_DAYS) }),
    context.repository.listGroupBlocks(hotel.id, { from: date, to: addDays(date, UPCOMING_GROUP_DAYS) }),
  ]);

  const roomTypeNameByCode = new Map((profile?.roomTypes ?? []).map((type) => [type.code, type.name]));
  const roomTypeOf = (roomNumber: string) => {
    const room = rooms.find((candidate) => candidate.roomNumber === roomNumber);
    return room ? (roomTypeNameByCode.get(room.roomTypeCode) ?? room.roomTypeCode) : 'Unknown room type';
  };
  const describe = (event: RoomStatusEvent): UnavailableRoom => ({ ...event, roomTypeName: roomTypeOf(event.roomNumber), backOn: addDays(event.lastNight, 1) });

  // One status per room: a room in two events the same night counts once, as out of order.
  const statusByRoom = new Map<string, RoomStatusEvent['kind']>();
  for (const event of eventsTonight) {
    if (statusByRoom.get(event.roomNumber) !== 'out_of_order') statusByRoom.set(event.roomNumber, event.kind);
  }
  const outOfOrder = [...statusByRoom.values()].filter((kind) => kind === 'out_of_order').length;
  const outOfService = [...statusByRoom.values()].filter((kind) => kind === 'out_of_service').length;
  const physicalRooms = hotel.roomCount;
  const sellableRooms = physicalRooms - outOfOrder - outOfService;
  if (occupied > sellableRooms) {
    // The demo data is built so this never happens (see the dataset tests); real data would need a closer look.
    throw new ToolInputError('no_data', `More rooms are sold (${occupied}) than can be sold (${sellableRooms}) on ${date}.`);
  }

  return {
    hotel,
    profile,
    date,
    basis,
    asOf: basis === 'results' ? date : context.today,
    inventory: {
      physicalRooms,
      occupied,
      outOfOrder,
      outOfService,
      vacantAvailable: sellableRooms - occupied,
      sellableRooms,
      occupancyOfPhysical: divideOrZero(occupied, physicalRooms),
      occupancyOfSellable: divideOrZero(occupied, sellableRooms),
    },
    unavailableRooms: eventsTonight.map(describe),
    upcomingRoomEvents: eventsAhead.filter((event) => event.firstNight > date).map(describe),
    upcomingGroupBlocks: groupBlocks.filter((block) => block.status === 'confirmed' && block.lastNight >= date),
    arrivalsAndDepartures: null,
  };
}
