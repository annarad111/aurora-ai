import { morningBriefingSchema, type MorningBriefing } from '@aurora/shared';
import { useCallback, useEffect, useState } from 'react';

export type MorningBriefingState =
  | { status: 'loading' }
  | { status: 'ready'; briefing: MorningBriefing }
  | { status: 'failed'; message: string };

/**
 * Loads GET /api/briefing for the hotel. One request per hotel (and per
 * retry); a request for a hotel the user has left is cancelled, so an old
 * answer can never replace the current one.
 */
export function useMorningBriefing(hotelId: string | null): { state: MorningBriefingState; retry: () => void } {
  const [state, setState] = useState<MorningBriefingState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hotelId) return;
    const abortController = new AbortController();
    setState({ status: 'loading' });

    fetch(`/api/briefing?hotel=${encodeURIComponent(hotelId)}`, { signal: abortController.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = (body as { error?: { message?: string } }).error?.message ?? `The server answered ${response.status}.`;
          throw new Error(message);
        }
        // Checked at runtime: a briefing that does not match the contract is an error, not a half-drawn card.
        const parsed = morningBriefingSchema.safeParse(body);
        if (!parsed.success) throw new Error('The briefing came back in an unexpected shape.');
        setState({ status: 'ready', briefing: parsed.data });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        setState({ status: 'failed', message: error instanceof Error ? error.message : 'The briefing could not be loaded.' });
      });

    return () => abortController.abort();
  }, [hotelId, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { state, retry };
}
