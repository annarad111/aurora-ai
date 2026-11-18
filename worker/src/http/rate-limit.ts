import { errorResponse } from './json-response';

/**
 * The part of Cloudflare's rate limiting binding we use. Configured in
 * wrangler.jsonc ("ratelimits"): a number of requests per period, per key.
 */
export interface RequestRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** One client = one IP address. Cloudflare sets cf-connecting-ip; locally every request counts as "local". */
export function clientKeyFor(request: Request, routeName: string): string {
  return `${routeName}:${request.headers.get('cf-connecting-ip') ?? 'local'}`;
}

/**
 * Returns a 429 response when the client is over the limit, or null to continue.
 * Without a limiter (tests), every request continues.
 */
export async function enforceRateLimit(
  limiter: RequestRateLimiter | null,
  request: Request,
  routeName: string,
): Promise<Response | null> {
  if (!limiter) return null;
  const { success } = await limiter.limit({ key: clientKeyFor(request, routeName) });
  if (success) return null;

  const response = errorResponse(429, 'rate_limited', 'Too many requests. Please wait a minute and try again.');
  response.headers.set('retry-after', '60');
  return response;
}
