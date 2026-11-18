import type { AppDependencies } from '../app';
import { errorResponse, jsonResponse } from '../http/json-response';
import { enforceRateLimit } from '../http/rate-limit';
import { callTool } from '../tools/registry';
import { ToolInputError } from '../tools/tool-context';

/**
 * POST /api/simulate   body: { "hotelId", "stayFrom", "stayTo", "paceRecovery"?, "rateChange"?, "otaToDirect"? }
 *
 * The simulate_scenario tool over HTTP. The simulator calls it once when it
 * opens, for the basis; while the sliders move, the browser runs the same
 * calculation itself, so this is not called on every change.
 */
export async function handleSimulate(request: Request, dependencies: AppDependencies): Promise<Response> {
  const rateLimited = await enforceRateLimit(dependencies.rateLimiters.chat, request, 'chat');
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'invalid_json', 'The request body must be JSON');
  }
  try {
    return jsonResponse(await callTool('simulate_scenario', body, dependencies.toolContext));
  } catch (error) {
    if (error instanceof ToolInputError) {
      return errorResponse(error.code === 'unknown_hotel' ? 404 : 400, error.code, error.message);
    }
    throw error;
  }
}
