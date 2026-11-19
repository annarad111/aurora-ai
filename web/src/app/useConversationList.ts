import { conversationListSchema, type ConversationSummary } from '@aurora/shared';
import { useCallback, useEffect, useState } from 'react';

/** Null when it worked, else a message the user can act on. */
export type ConversationChangeError = string | null;

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // Not JSON.
  }
  return `The server answered ${response.status}.`;
}

/** The sidebar's "Recent" list: the hotel's stored conversations, newest first, with rename and delete. */
export function useConversationList(hotelId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!hotelId) return;
    const abortController = new AbortController();
    fetch(`/api/conversations?hotel=${encodeURIComponent(hotelId)}`, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) return;
        setConversations(conversationListSchema.parse(await response.json()).conversations);
      })
      // The list is a convenience: if it cannot load, the chat still works.
      .catch(() => {});
    return () => abortController.abort();
  }, [hotelId, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const send = useCallback(
    async (conversationId: string, init: RequestInit): Promise<ConversationChangeError> => {
      if (!hotelId) return 'Pick a hotel first.';
      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}?hotel=${encodeURIComponent(hotelId)}`, init);
        if (!response.ok) return await readError(response);
        reload();
        return null;
      } catch {
        return 'Aurora could not be reached. Check your connection and try again.';
      }
    },
    [hotelId, reload],
  );

  const rename = useCallback(
    async (conversationId: string, title: string): Promise<ConversationChangeError> => {
      const error = await send(conversationId, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
      // Shown at once; the reload confirms it.
      if (!error) setConversations((current) => current.map((summary) => (summary.id === conversationId ? { ...summary, title: title.trim() } : summary)));
      return error;
    },
    [send],
  );

  const remove = useCallback(
    async (conversationId: string): Promise<ConversationChangeError> => {
      const error = await send(conversationId, { method: 'DELETE' });
      if (!error) setConversations((current) => current.filter((summary) => summary.id !== conversationId));
      return error;
    },
    [send],
  );

  return { conversations, reload, rename, remove };
}
