import { workspaceSchema, type Workspace } from '@aurora/shared';
import type { AppDependencies } from '../app';
import { errorResponse, jsonResponse } from '../http/json-response';
import { monthToDate } from '../orchestrator/analysis-context';
import { TOOL_DEFINITIONS } from '../tools/registry';

const RECENT_QUESTION_COUNT = 5;

/**
 * GET /api/workspace?hotel=<id>
 * Everything the UI shows before a question: the hotels, the period, the starter
 * questions and the recent questions. Without ?hotel, the first hotel by name.
 */
export async function handleWorkspace(url: URL, dependencies: AppDependencies): Promise<Response> {
  const { repository, today } = dependencies.toolContext;
  const hotels = await repository.listHotels();
  if (hotels.length === 0) return errorResponse(503, 'no_hotels', 'The database has no hotels yet. Run the migrations first.');

  const requestedHotelId = url.searchParams.get('hotel');
  const hotel = requestedHotelId ? hotels.find((candidate) => candidate.id === requestedHotelId) : hotels[0];
  if (!hotel) return errorResponse(404, 'unknown_hotel', `No hotel with id "${requestedHotelId}"`);

  const [suggestedQuestions, recentQuestions] = await Promise.all([
    repository.listSuggestedQuestions(hotel.id),
    repository.listRecentQuestions(hotel.id, RECENT_QUESTION_COUNT),
  ]);

  const workspace: Workspace = {
    hotels,
    hotel,
    today,
    period: monthToDate(today),
    suggestedQuestions: suggestedQuestions.map(({ topic, question }) => ({ topic, question })),
    recentQuestions,
    mcp: { endpoint: '/mcp', toolCount: TOOL_DEFINITIONS.length },
  };
  return jsonResponse(workspaceSchema.parse(workspace));
}
