import type { WorkerConfig } from './env';
import type { LanguageModel } from './llm/language-model';
import { errorResponse } from './http/json-response';
import { handleChat } from './routes/chat';
import { handleHealth } from './routes/health';
import { handleHotelOverview } from './routes/hotels';
import type { ToolContext } from './tools/tool-context';

/**
 * Everything a request handler needs. The Worker entry builds it from the real
 * bindings (D1, assets). Tests build it from the in-memory dataset.
 */
export interface AppDependencies {
  toolContext: ToolContext;
  config: WorkerConfig;
  /** The model that chooses tools and writes the text. Null means templates only. */
  languageModel: LanguageModel | null;
  /** Keeps work running after the response has started (the streamed answer). */
  waitUntil: (work: Promise<unknown>) => void;
  /** Static files of the React app. Absent in tests. */
  assets?: Fetcher;
}

const HOTEL_OVERVIEW_PATH = /^\/api\/hotels\/([^/]+)\/overview$/;

export async function handleRequest(request: Request, dependencies: AppDependencies): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  try {
    if (pathname === '/api/health') {
      return request.method === 'GET' ? await handleHealth(dependencies) : methodNotAllowed();
    }

    if (pathname === '/api/chat') {
      return request.method === 'POST' ? await handleChat(request, dependencies) : methodNotAllowed();
    }

    const overviewMatch = HOTEL_OVERVIEW_PATH.exec(pathname);
    if (overviewMatch) {
      return request.method === 'GET' ? await handleHotelOverview(decodeURIComponent(overviewMatch[1]!), url, dependencies) : methodNotAllowed();
    }

    if (pathname.startsWith('/api/') || pathname === '/mcp' || pathname.startsWith('/mcp/')) {
      return errorResponse(404, 'not_found', `No route for ${request.method} ${pathname}`);
    }

    // Anything else is the React app.
    return dependencies.assets ? await dependencies.assets.fetch(request) : errorResponse(404, 'not_found', 'No static assets in this environment');
  } catch (error) {
    console.error('[Aurora] request failed', error);
    return errorResponse(500, 'internal_error', 'Something went wrong on our side');
  }
}

function methodNotAllowed(): Response {
  return errorResponse(405, 'method_not_allowed', 'This method is not supported on this route');
}
