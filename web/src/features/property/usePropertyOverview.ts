import { propertyOverviewSchema, type PropertyOverview } from '@aurora/shared';
import { useCallback, useEffect, useState } from 'react';

export type PropertyOverviewState =
  | { status: 'loading' }
  | { status: 'ready'; overview: PropertyOverview }
  | { status: 'failed'; message: string };

/**
 * Loads GET /api/property for the hotel, only while the page is open (`isActive`).
 * A request for a hotel the user has left is cancelled; the answer is checked
 * against the contract before anything is drawn.
 */
export function usePropertyOverview(hotelId: string | null, isActive: boolean): { state: PropertyOverviewState; retry: () => void } {
  const [state, setState] = useState<PropertyOverviewState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelId || !isActive) return;
    // Opening the page again shows what was loaded; a retry or another hotel loads again.
    if (loadedFor === `${hotelId}:${attempt}`) return;
    const abortController = new AbortController();
    setState({ status: 'loading' });

    fetch(`/api/property?hotel=${encodeURIComponent(hotelId)}`, { signal: abortController.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          throw new Error((body as { error?: { message?: string } }).error?.message ?? `The server answered ${response.status}.`);
        }
        const parsed = propertyOverviewSchema.safeParse(body);
        if (!parsed.success) throw new Error('The property overview came back in an unexpected shape.');
        setState({ status: 'ready', overview: parsed.data });
        setLoadedFor(`${hotelId}:${attempt}`);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        setState({ status: 'failed', message: error instanceof Error ? error.message : 'The property overview could not be loaded.' });
      });
    return () => abortController.abort();
  }, [hotelId, isActive, attempt, loadedFor]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { state, retry };
}
