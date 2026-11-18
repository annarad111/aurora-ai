import { handleRequest } from './app';
import { D1HotelDataRepository } from './db/d1-hotel-data-repository';
import { readWorkerConfig, type Env } from './env';
import { WorkersAiLanguageModel } from './llm/workers-ai-model';

/** Cloudflare Worker entry point. Builds the real dependencies and hands over to the router. */
export default {
  async fetch(request, env, executionContext): Promise<Response> {
    const config = readWorkerConfig(env);
    const languageModel =
      config.narrativeProvider === 'llm' && env.AI ? new WorkersAiLanguageModel(env.AI, config.aiModel, config.aiTimeoutMs) : null;

    return handleRequest(request, {
      toolContext: { repository: new D1HotelDataRepository(env.DB), today: config.today },
      config,
      languageModel,
      mcpToken: env.MCP_TOKEN?.trim() || null,
      rateLimiters: { chat: env.CHAT_RATE_LIMITER ?? null, mcp: env.MCP_RATE_LIMITER ?? null },
      waitUntil: (work) => executionContext.waitUntil(work),
      assets: env.ASSETS,
    });
  },
} satisfies ExportedHandler<Env>;
