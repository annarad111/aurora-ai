import type { AppDependencies } from '../app';
import { jsonResponse } from '../http/json-response';

/** GET /api/health: confirms the Worker runs and the database has been seeded. */
export async function handleHealth(dependencies: AppDependencies): Promise<Response> {
  const channelCommissions = await dependencies.toolContext.repository.listChannelCommissions();
  return jsonResponse({
    status: 'ok',
    database: channelCommissions.length > 0 ? 'seeded' : 'empty',
    today: dependencies.toolContext.today,
  });
}
