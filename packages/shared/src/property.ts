import { z } from 'zod';
import { dateRangeSchema, groupBlockSchema, hotelSchema, isoDateSchema } from './domain';
import { kpiComparisonSchema } from './metric-meta';

// ---------------------------------------------------------------------------
// The property itself: who it is, its rooms, and which rooms cannot be sold.
//
// Definitions used everywhere (UI, chat, MCP), for one night:
//   physical rooms     every room the hotel has (111)
//   out of order       broken, taken out of inventory (repairs): cannot be sold
//   out of service     briefly held back (deep cleaning, a fault): not sold tonight
//   occupied           rooms sold for the night (from the results); for a future
//                      night these are rooms *booked so far*, never "occupied"
//   vacant & available physical − occupied − out of order − out of service
//   sellable rooms     physical − out of order − out of service
// The four statuses are mutually exclusive and add up to the physical rooms.
//
// Profile details, room numbers and maintenance events are fictional demo data
// (see packages/demo-data/src/property.ts), consistent with the results.
// ---------------------------------------------------------------------------

export const roomTypeSchema = z.object({
  code: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});
export type RoomType = z.infer<typeof roomTypeSchema>;

/** Table `property_profiles`. */
export const propertyProfileSchema = z.object({
  hotelId: z.string(),
  country: z.string(),
  /** Fictional demo address. */
  addressLine: z.string(),
  propertyType: z.string(),
  roomTypes: z.array(roomTypeSchema),
  /** True for the demo: the details are made up, not facts about a real hotel. */
  isDemoData: z.boolean(),
});
export type PropertyProfile = z.infer<typeof propertyProfileSchema>;

/** Table `rooms`. */
export const roomSchema = z.object({
  hotelId: z.string(),
  roomNumber: z.string(),
  floor: z.number().int(),
  roomTypeCode: z.string(),
});
export type Room = z.infer<typeof roomSchema>;

export const ROOM_STATUS_KINDS = ['out_of_order', 'out_of_service'] as const;
export const roomStatusKindSchema = z.enum(ROOM_STATUS_KINDS);
export type RoomStatusKind = z.infer<typeof roomStatusKindSchema>;

/** Table `room_status_events`: a room that cannot be sold for some nights (maintenance). */
export const roomStatusEventSchema = z.object({
  id: z.string(),
  hotelId: z.string(),
  roomNumber: z.string(),
  kind: roomStatusKindSchema,
  /** Short title: "Air conditioning repair". */
  reason: z.string(),
  description: z.string(),
  /** First and last night the room cannot be sold, inclusive. It is back the night after `lastNight`. */
  firstNight: isoDateSchema,
  lastNight: isoDateSchema,
});
export type RoomStatusEvent = z.infer<typeof roomStatusEventSchema>;

// --- get_property_status ---------------------------------------------------------

export const getPropertyStatusInputSchema = z.object({
  hotelId: z.string().min(1).max(64),
  /** The night to look at (default: today). A future night is read from the bookings on the books. */
  date: isoDateSchema.optional(),
});
export type GetPropertyStatusInput = z.infer<typeof getPropertyStatusInputSchema>;

export const unavailableRoomSchema = roomStatusEventSchema.extend({
  roomTypeName: z.string(),
  /** The first night the room can be sold again. */
  backOn: isoDateSchema,
});
export type UnavailableRoom = z.infer<typeof unavailableRoomSchema>;

export const roomInventorySchema = z.object({
  physicalRooms: z.number().int().nonnegative(),
  /** Rooms sold for the night (results), or booked so far (future night). */
  occupied: z.number().int().nonnegative(),
  outOfOrder: z.number().int().nonnegative(),
  outOfService: z.number().int().nonnegative(),
  vacantAvailable: z.number().int().nonnegative(),
  /** physical − out of order − out of service. */
  sellableRooms: z.number().int().nonnegative(),
  /** occupied / physical rooms (the hotel's usual occupancy definition). */
  occupancyOfPhysical: z.number(),
  /** occupied / sellable rooms. */
  occupancyOfSellable: z.number(),
});
export type RoomInventory = z.infer<typeof roomInventorySchema>;

export const getPropertyStatusOutputSchema = z.object({
  hotel: hotelSchema,
  profile: propertyProfileSchema.nullable(),
  /** The night described. */
  date: isoDateSchema,
  /** results: rooms sold that night. on_the_books: rooms booked so far for a future night. */
  basis: z.enum(['results', 'on_the_books']),
  /** When the numbers were true: the results date or the bookings snapshot date. */
  asOf: isoDateSchema,
  inventory: roomInventorySchema,
  /** Rooms that cannot be sold that night, and why. */
  unavailableRooms: z.array(unavailableRoomSchema),
  /** Maintenance starting in the next 14 days. */
  upcomingRoomEvents: z.array(unavailableRoomSchema),
  /** Confirmed group blocks with nights in the next 30 days. */
  upcomingGroupBlocks: z.array(groupBlockSchema),
  /** Arrivals and departures need reservation-level data, which this dataset does not have. */
  arrivalsAndDepartures: z.null(),
});
export type GetPropertyStatusOutput = z.infer<typeof getPropertyStatusOutputSchema>;

// --- GET /api/property: the Property Overview page -----------------------------------

export const monthlyRevenueSchema = z.object({
  /** "Oct 2026". */
  label: z.string(),
  period: dateRangeSchema,
  /** False for the current month, which is not finished. */
  isComplete: z.boolean(),
  roomRevenue: z.number(),
  roomRevenueTarget: z.number().nullable(),
  roomRevenueLastYear: z.number().nullable(),
});
export type MonthlyRevenue = z.infer<typeof monthlyRevenueSchema>;

export const propertyOverviewSchema = z.object({
  status: getPropertyStatusOutputSchema,
  /** Maintenance (last 14 days to 30 days ahead), group arrivals (next 30 days) and recent group cancellations. */
  events: z.lazy(() => z.array(propertyEventSchema)),
  financial: z.object({
    /** The previous completed calendar month. */
    period: dateRangeSchema,
    /** Room revenue, occupancy, ADR and RevPAR, each against target and last year. */
    kpis: z.array(kpiComparisonSchema),
    /** Every month with results, oldest first; the last one may be the current, unfinished month. */
    monthlyRevenue: z.array(monthlyRevenueSchema),
    /** The first night with results in the dataset. */
    historyStart: isoDateSchema,
  }),
});
export type PropertyOverview = z.infer<typeof propertyOverviewSchema>;

// --- get_room_events: maintenance with its measured impact ---------------------------

/** One night of a maintenance event: how many rooms were (or are still) free once every unsellable room is taken out. */
export const roomEventNightSchema = z.object({
  date: isoDateSchema,
  basis: z.enum(['results', 'on_the_books']),
  vacantRooms: z.number().int(),
  /** No vacant room left: a room under maintenance may have cost a sale that night. */
  isFull: z.boolean(),
});

/**
 * Maintenance on one or more rooms with the same reason and nights
 * ("Rooms 118, 119: carpet replacement"), with what it did to sales:
 * a room out of order only costs a sale on a night the hotel is full.
 */
export const roomEventSchema = z.object({
  id: z.string(),
  roomNumbers: z.array(z.string()).min(1),
  roomTypeNames: z.array(z.string()),
  kind: roomStatusKindSchema,
  reason: z.string(),
  description: z.string(),
  firstNight: isoDateSchema,
  lastNight: isoDateSchema,
  backOn: isoDateSchema,
  status: z.enum(['completed', 'in_progress', 'scheduled']),
  impact: z.object({
    /** Rooms × nights that cannot be sold. */
    roomNights: z.number().int().nonnegative(),
    nights: z.array(roomEventNightSchema),
    /** Nights with no vacant room (a possible lost sale). */
    nightsFull: z.number().int().nonnegative(),
    /** The tightest night: the fewest vacant rooms, and when. */
    fewestVacant: z.object({ rooms: z.number().int(), date: isoDateSchema }).nullable(),
  }),
});
export type RoomEvent = z.infer<typeof roomEventSchema>;

export const getRoomEventsInputSchema = z.object({
  hotelId: z.string().min(1).max(64),
  /** Nights to look at (default: the last 14 days to 30 days ahead). */
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /** One event ("maint-305-air-conditioning"), or every event in the window. */
  eventId: z.string().max(200).optional(),
  /** Only events on this room. */
  roomNumber: z.string().max(10).optional(),
});
export type GetRoomEventsInput = z.infer<typeof getRoomEventsInputSchema>;

export const getRoomEventsOutputSchema = z.object({
  today: isoDateSchema,
  window: dateRangeSchema,
  events: z.array(roomEventSchema),
});
export type GetRoomEventsOutput = z.infer<typeof getRoomEventsOutputSchema>;

// --- Events & alerts on the Property Overview -------------------------------------------

export const propertyEventSchema = z.discriminatedUnion('type', [
  roomEventSchema.extend({ type: z.literal('maintenance') }),
  z.object({
    type: z.literal('group_arrival'),
    id: z.string(),
    name: z.string(),
    segment: z.string(),
    firstNight: isoDateSchema,
    lastNight: isoDateSchema,
    roomsPerNight: z.number().int().positive(),
    roomNights: z.number().int().nonnegative(),
    status: z.enum(['in_progress', 'scheduled']),
  }),
  z.object({
    type: z.literal('group_cancellation'),
    id: z.string(),
    name: z.string(),
    segment: z.string(),
    firstNight: isoDateSchema,
    lastNight: isoDateSchema,
    roomsPerNight: z.number().int().positive(),
    roomNights: z.number().int().nonnegative(),
    cancelledOn: isoDateSchema,
  }),
]);
export type PropertyEvent = z.infer<typeof propertyEventSchema>;
