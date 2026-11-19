import { conversationSchema, type StoredTurn } from '@aurora/shared';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { readStreamEvents } from './parse-sse';
import { initialRunState, runReducer, type RunAction, type RunState } from './run-reducer';

const CHAT_ENDPOINT = '/api/chat';

/** One message of the chat: the question and Aurora's answer to it. */
export interface ConversationTurnState {
  /** Stable React key. */
  key: string;
  run: RunState;
  /** True for an answer opened from history: shown as it was, without streaming or animations. */
  isRestored: boolean;
}

export interface ConversationState {
  /** Made in the browser when a chat starts; the server stores every answer under it. */
  conversationId: string;
  turns: ConversationTurnState[];
  /** While an old conversation is being opened. */
  isOpening: boolean;
  openError: string | null;
}

type ConversationAction =
  | { type: 'new_chat'; conversationId: string }
  | { type: 'opening'; conversationId: string }
  | { type: 'opened'; conversationId: string; turns: ConversationTurnState[] }
  | { type: 'open_failed'; message: string }
  | { type: 'turn_added'; key: string; question: string }
  | { type: 'turn_removed'; key: string }
  | { type: 'turn_changed'; key: string; action: RunAction };

function createConversationId(): string {
  return crypto.randomUUID();
}

function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case 'new_chat':
      return { conversationId: action.conversationId, turns: [], isOpening: false, openError: null };
    case 'opening':
      return { conversationId: action.conversationId, turns: [], isOpening: true, openError: null };
    case 'opened':
      return { conversationId: action.conversationId, turns: action.turns, isOpening: false, openError: null };
    case 'open_failed':
      return { ...state, isOpening: false, openError: action.message };
    case 'turn_added':
      return {
        ...state,
        turns: [...state.turns, { key: action.key, run: runReducer(initialRunState, { type: 'run_requested', question: action.question }), isRestored: false }],
      };
    case 'turn_removed':
      return { ...state, turns: state.turns.filter((turn) => turn.key !== action.key) };
    case 'turn_changed':
      return {
        ...state,
        turns: state.turns.map((turn) => (turn.key === action.key ? { ...turn, run: runReducer(turn.run, action.action) } : turn)),
      };
  }
}

/** Rebuilds a stored answer from its events, all at once: no streaming, no tools, no model. */
function restoreTurn(storedTurn: StoredTurn, position: number): ConversationTurnState {
  const run = storedTurn.events.reduce<RunState>(
    (state, event) => runReducer(state, { type: 'event_received', event }),
    runReducer(initialRunState, { type: 'run_requested', question: storedTurn.question }),
  );
  return { key: `restored-${position}`, run, isRestored: true };
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

export interface Conversation {
  state: ConversationState;
  /** True while an answer streams; a new question waits until it is stored. */
  isBusy: boolean;
  ask: (question: string) => void;
  stop: () => void;
  /** Asks the last question again (after an error or Stop). */
  retry: () => void;
  newChat: () => void;
  /** Opens a stored conversation as it was. */
  open: (conversationId: string) => void;
}

/**
 * The chat: every question and answer of one conversation, in order. New
 * answers stream into the thread; stored ones open instantly from the
 * database. Calls `onAnswerStored` when an answer has been saved, so the
 * "Recent" list can refresh.
 */
export function useConversation(hotelId: string | null, onAnswerStored: () => void): Conversation {
  const [state, dispatch] = useReducer(conversationReducer, undefined, () => ({
    conversationId: createConversationId(),
    turns: [],
    isOpening: false,
    openError: null,
  }));
  const activeRequest = useRef<AbortController | null>(null);
  const activeTurnKey = useRef<string | null>(null);
  const [busyCount, setBusyCount] = useReducer((count: number, change: number) => count + change, 0);
  const nextTurnNumber = useRef(0);
  const conversationIdRef = useRef(state.conversationId);
  conversationIdRef.current = state.conversationId;

  const ask = useCallback(
    (question: string) => {
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion || !hotelId) return;
      activeRequest.current?.abort();
      const abortController = new AbortController();
      activeRequest.current = abortController;
      const key = `turn-${nextTurnNumber.current++}`;
      activeTurnKey.current = key;
      dispatch({ type: 'turn_added', key, question: trimmedQuestion });
      const changeTurn = (action: RunAction) => dispatch({ type: 'turn_changed', key, action });
      setBusyCount(1);

      void (async () => {
        try {
          const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question: trimmedQuestion, hotelId, conversationId: conversationIdRef.current }),
            signal: abortController.signal,
          });
          if (!response.ok || !response.body) {
            changeTurn({ type: 'connection_failed', message: await readErrorMessage(response) });
            return;
          }
          let receivedFinalEvent = false;
          let receivedDone = false;
          for await (const event of readStreamEvents(response.body)) {
            if (abortController.signal.aborted) return;
            changeTurn({ type: 'event_received', event });
            if (event.type === 'done' || event.type === 'error') receivedFinalEvent = true;
            if (event.type === 'done') receivedDone = true;
          }
          if (!receivedFinalEvent && !abortController.signal.aborted) {
            changeTurn({ type: 'connection_failed', message: 'The connection closed before the answer was complete.' });
          }
          // The server closes the stream after storing the answer.
          if (receivedDone) onAnswerStored();
        } catch {
          // Aborting (Stop, new chat) throws too; that is not an error for the user.
          if (abortController.signal.aborted) return;
          changeTurn({ type: 'connection_failed', message: 'Aurora could not be reached. Check your connection and try again.' });
        } finally {
          setBusyCount(-1);
        }
      })();
    },
    [hotelId, onAnswerStored],
  );

  const stop = useCallback(() => {
    // Aborting the request also closes the stream on the server, which stops the run there.
    activeRequest.current?.abort();
    if (activeTurnKey.current) dispatch({ type: 'turn_changed', key: activeTurnKey.current, action: { type: 'run_cancelled' } });
  }, []);

  const retry = useCallback(() => {
    const lastTurn = state.turns.at(-1);
    if (!lastTurn) return;
    dispatch({ type: 'turn_removed', key: lastTurn.key });
    ask(lastTurn.run.question);
  }, [ask, state.turns]);

  const newChat = useCallback(() => {
    activeRequest.current?.abort();
    dispatch({ type: 'new_chat', conversationId: createConversationId() });
  }, []);

  const open = useCallback((conversationId: string) => {
    activeRequest.current?.abort();
    dispatch({ type: 'opening', conversationId });
    void (async () => {
      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
        if (!response.ok) {
          dispatch({ type: 'open_failed', message: await readErrorMessage(response) });
          return;
        }
        const conversation = conversationSchema.parse(await response.json());
        dispatch({ type: 'opened', conversationId, turns: conversation.turns.map(restoreTurn) });
      } catch {
        dispatch({ type: 'open_failed', message: 'The conversation could not be opened.' });
      }
    })();
  }, []);

  // Another hotel starts a new chat; leaving the page stops the run.
  useEffect(() => {
    dispatch({ type: 'new_chat', conversationId: createConversationId() });
  }, [hotelId]);
  useEffect(() => () => activeRequest.current?.abort(), []);

  return { state, isBusy: busyCount > 0, ask, stop, retry, newChat, open };
}
