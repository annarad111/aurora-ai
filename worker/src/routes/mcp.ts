import type { AppDependencies } from '../app';
import { readBearerToken, tokensMatch } from '../http/bearer-token';
import { errorResponse } from '../http/json-response';
import { enforceRateLimit } from '../http/rate-limit';
import { handleMcpRequest } from '../mcp/aurora-mcp-server';

/**
 * /mcp — the MCP endpoint (Streamable HTTP).
 * Order of checks: configured → authorised → within the rate limit → MCP.
 */
export async function handleMcp(request: Request, dependencies: AppDependencies): Promise<Response> {
  // Browser CORS preflights carry no Authorization header; the MCP handler answers them.
  if (request.method === 'OPTIONS') return handleMcpRequest(request, dependencies.toolContext);

  if (!dependencies.mcpToken) {
    return errorResponse(503, 'mcp_not_configured', 'The MCP endpoint is disabled: set the MCP_TOKEN secret to enable it.');
  }

  const providedToken = readBearerToken(request);
  if (!providedToken || !(await tokensMatch(providedToken, dependencies.mcpToken))) {
    const response = errorResponse(401, 'unauthorized', 'Send "Authorization: Bearer <MCP_TOKEN>" to use this endpoint.');
    response.headers.set('www-authenticate', 'Bearer realm="aurora-mcp"');
    return response;
  }

  const rateLimited = await enforceRateLimit(dependencies.rateLimiters.mcp, request, 'mcp');
  if (rateLimited) return rateLimited;

  return handleMcpRequest(request, dependencies.toolContext);
}
