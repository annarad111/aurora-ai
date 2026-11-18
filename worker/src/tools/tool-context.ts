import type { Hotel, IsoDate } from '@aurora/shared';
import type { HotelDataRepository } from '../db/hotel-data-repository';

/** What every tool gets besides its input. */
export interface ToolContext {
  repository: HotelDataRepository;
  /** The date the hotel considers "today". Fixed in the demo (DEMO_TODAY) so results never change. */
  today: IsoDate;
}

/**
 * A problem with the request (unknown hotel, no data for the period).
 * The chat turns it into an error event, and MCP returns it as a tool error.
 */
export class ToolInputError extends Error {
  constructor(
    readonly code: 'unknown_hotel' | 'invalid_input' | 'no_data',
    message: string,
  ) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export async function requireHotel(context: ToolContext, hotelId: string): Promise<Hotel> {
  const hotel = await context.repository.findHotel(hotelId);
  if (!hotel) throw new ToolInputError('unknown_hotel', `No hotel with id "${hotelId}"`);
  return hotel;
}
