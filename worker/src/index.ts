import { handleRequest } from './app';
import { D1HotelDataRepository } from './db/d1-hotel-data-repository';
import { readWorkerConfig, type Env } from './env';

/** Cloudflare Worker entry point. Builds the real dependencies and hands over to the router. */
export default {
  async fetch(request, env, executionContext): Promise<Response> {
    const config = readWorkerConfig(env);
    return handleRequest(request, {
      toolContext: { repository: new D1HotelDataRepository(env.DB), today: config.today },
      config,
      waitUntil: (work) => executionContext.waitUntil(work),
      assets: env.ASSETS,
    });
  },
} satisfies ExportedHandler<Env>;
