import type { GroupBlock, PropertyProfile, Room, RoomStatusEvent, RoomType } from '@aurora/shared';
import { DEMO_HOTEL } from './story';

// ---------------------------------------------------------------------------
// The property behind the numbers: a fictional profile, 111 numbered rooms and
// a few maintenance events. All of it is demo data, made up to be consistent
// with the generated results:
//
//   - the room types add up to the hotel's 111 rooms
//   - on every night of a maintenance event, rooms sold (or booked) plus the
//     rooms out of order or out of service never exceed 111
//     (checked in packages/demo-data/test/demo-dataset.test.ts)
//
// Nothing here describes a real hotel: the address is invented, and the
// app labels these details as demo data.
// ---------------------------------------------------------------------------

/** Floors 1–3 have 19 rooms, floors 4–6 have 18: 111 rooms. */
const ROOMS_PER_FLOOR: Record<number, number> = { 1: 19, 2: 19, 3: 19, 4: 18, 5: 18, 6: 18 };

/** From the lowest floors up: most rooms are Classic, the suites are on the top floor. */
const ROOM_TYPE_PLAN: Array<{ code: string; name: string; count: number }> = [
  { code: 'CLS', name: 'Classic Double', count: 58 },
  { code: 'SUP', name: 'Superior Double', count: 33 },
  { code: 'DLX', name: 'Deluxe King', count: 14 },
  { code: 'JRS', name: 'Junior Suite', count: 6 },
];

export function generateDemoRooms(hotelId: string = DEMO_HOTEL.id): Room[] {
  const roomNumbers = Object.entries(ROOMS_PER_FLOOR).flatMap(([floor, count]) =>
    Array.from({ length: count }, (_, index) => ({ floor: Number(floor), roomNumber: `${floor}${String(index + 1).padStart(2, '0')}` })),
  );
  const typeCodes = ROOM_TYPE_PLAN.flatMap((type) => Array.from({ length: type.count }, () => type.code));
  return roomNumbers.map(({ floor, roomNumber }, index) => ({ hotelId, roomNumber, floor, roomTypeCode: typeCodes[index]! }));
}

export function demoRoomTypes(): RoomType[] {
  return ROOM_TYPE_PLAN.map(({ code, name, count }) => ({ code, name, count }));
}

export const DEMO_PROPERTY_PROFILE: PropertyProfile = {
  hotelId: DEMO_HOTEL.id,
  country: 'Belgium',
  addressLine: 'Rue des Minimes 12, 1000 Brussels (fictional demo address)',
  propertyType: 'Upscale city hotel',
  roomTypes: demoRoomTypes(),
  isDemoData: true,
};

/** Maintenance around the demo's today (17 November 2026): one finished, three running, one coming up. */
export const DEMO_ROOM_STATUS_EVENTS: RoomStatusEvent[] = [
  {
    id: 'maint-203-plumbing',
    hotelId: DEMO_HOTEL.id,
    roomNumber: '203',
    kind: 'out_of_order',
    reason: 'Plumbing repair',
    description: 'Blocked drain under the shower; the floor tiles around it were replaced.',
    firstNight: '2026-11-03',
    lastNight: '2026-11-06',
  },
  {
    id: 'maint-305-air-conditioning',
    hotelId: DEMO_HOTEL.id,
    roomNumber: '305',
    kind: 'out_of_order',
    reason: 'Air conditioning repair',
    description: 'The air conditioning unit failed; a replacement compressor is on order.',
    firstNight: '2026-11-15',
    lastNight: '2026-11-21',
  },
  {
    id: 'maint-412-water-leak',
    hotelId: DEMO_HOTEL.id,
    roomNumber: '412',
    kind: 'out_of_order',
    reason: 'Water leak in the bathroom',
    description: 'A leak behind the bathroom wall; the wall is open while it dries.',
    firstNight: '2026-11-16',
    lastNight: '2026-11-19',
  },
  {
    id: 'maint-118-carpet',
    hotelId: DEMO_HOTEL.id,
    roomNumber: '118',
    kind: 'out_of_service',
    reason: 'Carpet replacement',
    description: 'New carpet on the first floor; the room is held back for two nights.',
    firstNight: '2026-11-17',
    lastNight: '2026-11-18',
  },
  {
    id: 'maint-119-carpet',
    hotelId: DEMO_HOTEL.id,
    roomNumber: '119',
    kind: 'out_of_service',
    reason: 'Carpet replacement',
    description: 'New carpet on the first floor; the room is held back for two nights.',
    firstNight: '2026-11-17',
    lastNight: '2026-11-18',
  },
  {
    id: 'maint-610-window',
    hotelId: DEMO_HOTEL.id,
    roomNumber: '610',
    kind: 'out_of_order',
    reason: 'Window seal replacement',
    description: 'Planned replacement of the window seals before winter.',
    firstNight: '2026-11-24',
    lastNight: '2026-11-26',
  },
];

/**
 * A confirmed group arriving after the demo's today, for the "events & alerts" of the
 * Property Overview. Fictional. Its rooms are part of the bookings already on the
 * books for those nights (checked in the dataset tests), so pace is unchanged.
 */
export const DEMO_UPCOMING_GROUP_BLOCKS: GroupBlock[] = [
  {
    id: 'atelier-verdi-launch-2026',
    hotelId: DEMO_HOTEL.id,
    name: 'Atelier Verdi product launch',
    segment: 'mice',
    firstNight: '2026-11-26',
    lastNight: '2026-11-27',
    roomsPerNight: 14,
    status: 'confirmed',
    cancelledOn: null,
  },
];
