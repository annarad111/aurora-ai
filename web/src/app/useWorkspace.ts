import { workspaceSchema, type Workspace } from '@aurora/shared';
import { useCallback, useEffect, useState } from 'react';

export type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'failed'; message: string };

/**
 * Loads GET /api/workspace: the hotel, the period, the starter and recent
 * questions. The UI has no hotel data of its own; it all comes from here.
 */
export function useWorkspace(hotelId: string | null): { state: WorkspaceState; reload: () => void } {
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    const query = hotelId ? `?hotel=${encodeURIComponent(hotelId)}` : '';

    fetch(`/api/workspace${query}`, { signal: abortController.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = (body as { error?: { message?: string } }).error?.message ?? `The server answered ${response.status}.`;
          throw new Error(message);
        }
        // Keep the current screen while reloading; only replace it with fresh data.
        setState({ status: 'ready', workspace: workspaceSchema.parse(body) });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        setState({ status: 'failed', message: error instanceof Error ? error.message : 'Aurora could not be reached.' });
      });

    return () => abortController.abort();
  }, [hotelId, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  return { state, reload };
}
