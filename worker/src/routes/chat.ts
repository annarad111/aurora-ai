import { chatRequestSchema } from '@aurora/shared';
import type { AppDependencies } from '../app';
import { errorResponse } from '../http/json-response';
import { enforceRateLimit } from '../http/rate-limit';
import { KeywordInsightPlanner, LanguageModelInsightPlanner } from '../orchestrator/insight-planners';
import { LanguageModelNarrativeWriter } from '../orchestrator/language-model-narrative-writer';
import { runInsight } from '../orchestrator/run-insight';
import { ScriptedNarrativeWriter } from '../orchestrator/scripted-narrative-writer';
import { SSE_RESPONSE_HEADERS, SseEventStream } from '../sse/sse-event-stream';

/**
 * POST /api/chat   body: { "question": "...", "hotelId": "sablon-bru" }
 *
 * Bad input is answered with plain JSON (400 / 404) before any stream starts.
 * Otherwise the response is an SSE stream, and the answer is produced in the
 * background while the client reads.
 */
export async function handleChat(request: Request, dependencies: AppDependencies): Promise<Response> {
  const rateLimited = await enforceRateLimit(dependencies.rateLimiters.chat, request, 'chat');
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'invalid_json', 'The request body must be JSON');
  }

  const parsedRequest = chatRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return errorResponse(400, 'invalid_request', parsedRequest.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  const { question, hotelId } = parsedRequest.data;

  const hotel = await dependencies.toolContext.repository.findHotel(hotelId);
  if (!hotel) return errorResponse(404, 'unknown_hotel', `No hotel with id "${hotelId}"`);

  const stream = new SseEventStream(`run_${crypto.randomUUID()}`);
  request.signal?.addEventListener('abort', () => stream.abort(), { once: true });

  // With a model: it chooses the tools and writes the text, and falls back to the rules and templates.
  const { languageModel } = dependencies;
  const run = runInsight({
    question,
    hotelId,
    toolContext: dependencies.toolContext,
    emit: stream.emit,
    signal: stream.signal,
    pacing: { stepDelayMs: dependencies.config.stepDelayMs, textTokenDelayMs: dependencies.config.textTokenDelayMs },
    planner: languageModel ? new LanguageModelInsightPlanner(languageModel) : new KeywordInsightPlanner(),
    narrativeWriter: languageModel ? new LanguageModelNarrativeWriter(languageModel) : new ScriptedNarrativeWriter(),
  }).finally(() => stream.close());
  dependencies.waitUntil(run);

  return new Response(stream.readable, { headers: SSE_RESPONSE_HEADERS });
}
