import { MAXIMUM_HISTORY_TURNS, type ConversationTurn } from '@aurora/shared';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { readStreamEvents } from './parse-sse';
import { initialRunState, runReducer, type RunState } from './run-reducer';

const CHAT_ENDPOINT = '/api/chat';

export interface InsightRun {
  state: RunState;
  /** Asks a question. A run that is still streaming is stopped first. */
  start: (question: string) => void;
  /** Stops the current run and keeps what has arrived. */
  stop: () => void;
  /** Asks the same question again. */
  retry: () => void;
  /** Back to the idle screen, and forgets the conversation. */
  reset: () => void;
}

/** Reads `{ error: { message } }` from a JSON error response, if there is one. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return `The server answered ${response.status}.`;
}

/**
 * Connects the UI to POST /api/chat: sends the question, reads the event
 * stream and feeds every event into the run reducer.
 */
export function useInsightRun(hotelId: string | null): InsightRun {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const activeRequest = useRef<AbortController | null>(null);
  // Conversation memory: each finished answer adds what it covered, and the
  // next question is sent with it, so "and October?" knows what came before.
  const conversation = useRef<ConversationTurn[]>([]);
  // What the current run was sent with, so Retry asks with the same history.
  const historyOfCurrentRun = useRef<ConversationTurn[]>([]);

  const ask = useCallback(
    (question: string, history: ConversationTurn[]) => {
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion || !hotelId) return;
      historyOfCurrentRun.current = history;

      activeRequest.current?.abort();
      const abortController = new AbortController();
      activeRequest.current = abortController;
      dispatch({ type: 'run_requested', question: trimmedQuestion });

      void (async () => {
        try {
          const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question: trimmedQuestion, hotelId, history }),
            signal: abortController.signal,
          });
          if (!response.ok || !response.body) {
            dispatch({ type: 'connection_failed', message: await readErrorMessage(response) });
            return;
          }

          let receivedFinalEvent = false;
          for await (const event of readStreamEvents(response.body)) {
            if (abortController.signal.aborted) return;
            dispatch({ type: 'event_received', event });
            if (event.type === 'done' || event.type === 'error') receivedFinalEvent = true;
            if (event.type === 'done' && event.context) {
              conversation.current = [...history, { question: trimmedQuestion, context: event.context }].slice(-MAXIMUM_HISTORY_TURNS);
            }
          }
          if (!receivedFinalEvent && !abortController.signal.aborted) {
            dispatch({ type: 'connection_failed', message: 'The connection closed before the answer was complete.' });
          }
        } catch {
          // Aborting (Stop, new question) throws too; that is not an error for the user.
          if (abortController.signal.aborted) return;
          dispatch({ type: 'connection_failed', message: 'Aurora could not be reached. Check your connection and try again.' });
        }
      })();
    },
    [hotelId],
  );

  const start = useCallback((question: string) => ask(question, conversation.current), [ask]);

  const stop = useCallback(() => {
    // Aborting the request also closes the stream on the server, which stops the run there.
    activeRequest.current?.abort();
    dispatch({ type: 'run_cancelled' });
  }, []);

  const reset = useCallback(() => {
    activeRequest.current?.abort();
    conversation.current = [];
    dispatch({ type: 'reset' });
  }, []);

  const retry = useCallback(() => ask(state.question, historyOfCurrentRun.current), [ask, state.question]);

  // Another hotel starts a new conversation.
  useEffect(() => {
    conversation.current = [];
  }, [hotelId]);

  // Leaving the page stops the run.
  useEffect(() => () => activeRequest.current?.abort(), []);

  return { state, start, stop, retry, reset };
}
