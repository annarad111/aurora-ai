import type { RoomInventory, UnavailableRoom } from '@aurora/shared';

// How the room inventory is split on screen. Pure, so the reconciliation is tested.

export const ROOM_STATUSES = ['occupied', 'vacant', 'out_of_order', 'out_of_service'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  occupied: 'Occupied',
  vacant: 'Vacant & available',
  out_of_order: 'Out of order',
  out_of_service: 'Out of service',
};

/** What each status means, in the words of the definitions in packages/shared/src/property.ts. */
export const ROOM_STATUS_DEFINITIONS: Record<RoomStatus, string> = {
  occupied: 'Rooms sold for the night.',
  vacant: 'Rooms that can be sold and are not sold yet.',
  out_of_order: 'Broken and taken out of inventory for repairs: they cannot be sold.',
  out_of_service: 'Briefly held back (cleaning, a small fault): not sold tonight.',
};

export interface RoomStatusSegment {
  status: RoomStatus;
  rooms: number;
  /** Share of the physical rooms (0–1). */
  share: number;
}

/** The four mutually exclusive statuses, in a fixed order. They add up to the physical rooms. */
export function splitInventory(inventory: RoomInventory): RoomStatusSegment[] {
  const rooms: Record<RoomStatus, number> = {
    occupied: inventory.occupied,
    vacant: inventory.vacantAvailable,
    out_of_order: inventory.outOfOrder,
    out_of_service: inventory.outOfService,
  };
  return ROOM_STATUSES.map((status) => ({
    status,
    rooms: rooms[status],
    share: inventory.physicalRooms === 0 ? 0 : rooms[status] / inventory.physicalRooms,
  }));
}

/** True when the statuses add up to the physical rooms, as they must. */
export function inventoryReconciles(inventory: RoomInventory): boolean {
  return inventory.occupied + inventory.vacantAvailable + inventory.outOfOrder + inventory.outOfService === inventory.physicalRooms;
}

export function roomsWithStatus(rooms: readonly UnavailableRoom[], status: RoomStatus): UnavailableRoom[] {
  if (status === 'out_of_order' || status === 'out_of_service') return rooms.filter((room) => room.kind === status);
  return [];
}
