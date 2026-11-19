import { workspaceSchema, type Workspace } from '@aurora/shared';
import type { AppDependencies } from '../app';
import { errorResponse, jsonResponse } from '../http/json-response';
import { monthToDate } from '../orchestrator/analysis-context';
import { buildSuggestions } from '../orchestrator/suggestions';
import { TOOL_DEFINITIONS } from '../tools/registry';

/**
 * GET /api/workspace?hotel=<id>
 * Everything the UI shows before a question: the hotels, the period and the
 * starter questions, written from today's data. Without ?hotel, the first hotel by name.
 * The conversations of the sidebar come from GET /api/conversations.
 */
export async function handleWorkspace(url: URL, dependencies: AppDependencies): Promise<Response> {
  const { repository, today } = dependencies.toolContext;
  const hotels = await repository.listHotels();
  if (hotels.length === 0) return errorResponse(503, 'no_hotels', 'The database has no hotels yet. Run the migrations first.');

  const requestedHotelId = url.searchParams.get('hotel');
  const hotel = requestedHotelId ? hotels.find((candidate) => candidate.id === requestedHotelId) : hotels[0];
  if (!hotel) return errorResponse(404, 'unknown_hotel', `No hotel with id "${requestedHotelId}"`);

  const workspace: Workspace = {
    hotels,
    hotel,
    today,
    period: monthToDate(today),
    suggestions: await buildSuggestions(dependencies.toolContext, hotel),
    mcp: { endpoint: '/mcp', toolCount: TOOL_DEFINITIONS.length },
  };
  return jsonResponse(workspaceSchema.parse(workspace));
}
