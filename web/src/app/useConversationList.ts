import { conversationListSchema, type ConversationSummary } from '@aurora/shared';
import { useCallback, useEffect, useState } from 'react';

/** The sidebar's "Recent" list: the hotel's stored conversations, newest first. */
export function useConversationList(hotelId: string | null): { conversations: ConversationSummary[]; reload: () => void } {
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
  return { conversations, reload };
}
