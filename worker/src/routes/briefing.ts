import { morningBriefingSchema } from '@aurora/shared';
import type { AppDependencies } from '../app';
import { errorResponse, jsonResponse } from '../http/json-response';
import { buildMorningBriefing } from '../orchestrator/morning-briefing';

/**
 * GET /api/briefing?hotel=<id>
 * The three things that deserve attention today, ranked by fixed rules from
 * the hotel's data. A source that cannot be read is listed in
 * `unavailableSources`, and the briefing is built from the rest.
 */
export async function handleBriefing(url: URL, dependencies: AppDependencies): Promise<Response> {
  const hotelId = url.searchParams.get('hotel');
  if (!hotelId) return errorResponse(400, 'missing_hotel', 'Add ?hotel=<id>');
  const hotel = await dependencies.toolContext.repository.findHotel(hotelId);
  if (!hotel) return errorResponse(404, 'unknown_hotel', `No hotel with id "${hotelId}"`);
  const briefing = await buildMorningBriefing(dependencies.toolContext, hotel);
  return jsonResponse(morningBriefingSchema.parse(briefing));
}
