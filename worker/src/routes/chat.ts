import { chatRequestSchema, MAXIMUM_HISTORY_TURNS, type ConversationTurn, type StoredTurn, type StreamEvent } from '@aurora/shared';
import type { AppDependencies } from '../app';
import { errorResponse } from '../http/json-response';
import { enforceRateLimit } from '../http/rate-limit';
import { KeywordInsightPlanner, LanguageModelInsightPlanner } from '../orchestrator/insight-planners';
import { LanguageModelNarrativeWriter } from '../orchestrator/language-model-narrative-writer';
import { runInsight } from '../orchestrator/run-insight';
import { ScriptedNarrativeWriter } from '../orchestrator/scripted-narrative-writer';
import { SSE_RESPONSE_HEADERS, SseEventStream } from '../sse/sse-event-stream';

const MAXIMUM_TITLE_LENGTH = 70;

/** What the earlier answers covered, read from their stored `done` events, for follow-up questions. */
export function historyFromTurns(turns: readonly StoredTurn[]): ConversationTurn[] {
  return turns
    .flatMap((turn) => {
      const done = turn.events.find((event) => event.type === 'done');
      return done?.type === 'done' && done.context ? [{ question: turn.question, context: done.context }] : [];
    })
    .slice(-MAXIMUM_HISTORY_TURNS);
}

function titleFrom(question: string): string {
  return question.length <= MAXIMUM_TITLE_LENGTH ? question : `${question.slice(0, MAXIMUM_TITLE_LENGTH - 1).trimEnd()}…`;
}

/**
 * POST /api/chat   body: { "question": "...", "hotelId": "sablon-bru", "conversationId": "…" }
 *
 * Bad input is answered with plain JSON (400 / 404 / 409) before any stream
 * starts. Otherwise the response is an SSE stream, and the answer is produced
 * in the background while the client reads. A finished answer is stored with
 * its conversation, so it can be opened again later exactly as it was.
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
  const { question, hotelId, conversationId } = parsedRequest.data;
  const { repository } = dependencies.toolContext;

  const hotel = await repository.findHotel(hotelId);
  if (!hotel) return errorResponse(404, 'unknown_hotel', `No hotel with id "${hotelId}"`);

  const conversation = await repository.findConversation(conversationId);
  if (conversation && conversation.hotelId !== hotelId) {
    return errorResponse(409, 'conversation_of_another_hotel', 'This conversation belongs to another hotel. Start a new chat.');
  }

  const sentEvents: StreamEvent[] = [];
  const stream = new SseEventStream(`run_${crypto.randomUUID()}`, (event) => sentEvents.push(event));
  request.signal?.addEventListener('abort', () => stream.abort(), { once: true });

  // With a model: it chooses the tools and writes the text, and falls back to the rules and templates.
  const { languageModel } = dependencies;
  const run = runInsight({
    question,
    hotelId,
    history: historyFromTurns(conversation?.turns ?? []),
    toolContext: dependencies.toolContext,
    emit: stream.emit,
    signal: stream.signal,
    pacing: { stepDelayMs: dependencies.config.stepDelayMs, textTokenDelayMs: dependencies.config.textTokenDelayMs },
    planner: languageModel ? new LanguageModelInsightPlanner(languageModel) : new KeywordInsightPlanner(),
    narrativeWriter: languageModel ? new LanguageModelNarrativeWriter(languageModel) : new ScriptedNarrativeWriter(),
  })
    .then(async () => {
      // Only finished answers are stored; a stopped or failed one is not part of the conversation.
      const done = sentEvents.find((event) => event.type === 'done');
      if (done?.type !== 'done') return;
      await repository.saveConversationTurn({
        conversationId,
        hotelId,
        question,
        events: sentEvents,
        createdAt: new Date().toISOString(),
        titleCandidate: titleFrom(question),
        isAnalysis: done.answerKind === 'analysis',
      });
    })
    .catch((error: unknown) => console.warn('[Aurora] could not store the answer', error))
    // Closed after the answer is stored, so the next question of the conversation always sees it.
    .finally(() => stream.close());
  dependencies.waitUntil(run);

  return new Response(stream.readable, { headers: SSE_RESPONSE_HEADERS });
}
