import type { AppDependencies } from '../app';
import { errorResponse, jsonResponse } from '../http/json-response';
import { callTool } from '../tools/registry';
import { ToolInputError } from '../tools/tool-context';

/**
 * GET /api/hotels/:hotelId/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 * The overview tool over plain HTTP, without AI. Defaults to month to date.
 */
export async function handleHotelOverview(hotelId: string, url: URL, dependencies: AppDependencies): Promise<Response> {
  const today = dependencies.toolContext.today;
  const period = {
    from: url.searchParams.get('from') ?? `${today.slice(0, 7)}-01`,
    to: url.searchParams.get('to') ?? today,
  };
  try {
    const overview = await callTool('get_hotel_overview', { hotelId, period }, dependencies.toolContext);
    return jsonResponse(overview);
  } catch (error) {
    if (error instanceof ToolInputError) {
      return errorResponse(error.code === 'unknown_hotel' ? 404 : 400, error.code, error.message);
    }
    throw error;
  }
}
