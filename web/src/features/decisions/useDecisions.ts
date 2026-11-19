import {
  decisionActionSchema,
  decisionsSchema,
  savedInsightSchema,
  type DecisionAction,
  type DecisionActionPatch,
  type Decisions,
  type NewDecisionAction,
  type NewSavedInsight,
  type SavedInsight,
} from '@aurora/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type DecisionsState =
  | { status: 'loading' }
  | { status: 'ready'; decisions: Decisions }
  | { status: 'failed'; message: string };

/** A change either worked, or says why not, in words the user can act on. */
export type ChangeResult<Value = void> = { ok: true; value: Value } | { ok: false; message: string };

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // Not JSON.
  }
  return `The server answered ${response.status}.`;
}

/**
 * Saved insights and actions of one hotel, from GET /api/decisions, and the
 * changes to them. After every change the list is read again, so outcomes
 * (measured on the server) are always current. A slower, older response
 * never replaces a newer one.
 */
/** `today` is the hotel's today (the demo's date), for overdue actions. */
export function useDecisions(hotelId: string | null, today: string | null = null) {
  const [state, setState] = useState<DecisionsState>({ status: 'loading' });
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    if (!hotelId) return;
    const requestNumber = ++latestRequest.current;
    try {
      const response = await fetch(`/api/decisions?hotel=${encodeURIComponent(hotelId)}`);
      if (!response.ok) throw new Error(await readError(response));
      const decisions = decisionsSchema.parse(await response.json());
      if (requestNumber === latestRequest.current) setState({ status: 'ready', decisions });
    } catch (error) {
      if (requestNumber !== latestRequest.current) return;
      setState((current) =>
        // Keep what is on screen when a refresh fails; only an empty screen shows the error.
        current.status === 'ready' ? current : { status: 'failed', message: error instanceof Error ? error.message : 'Decisions could not be loaded.' },
      );
    }
  }, [hotelId]);

  useEffect(() => {
    setState({ status: 'loading' });
    void reload();
  }, [reload]);

  async function change<Value>(request: () => Promise<Response>, read: (response: Response) => Promise<Value>): Promise<ChangeResult<Value>> {
    try {
      const response = await request();
      if (!response.ok) return { ok: false, message: await readError(response) };
      const value = await read(response);
      await reload();
      return { ok: true, value };
    } catch {
      return { ok: false, message: 'Aurora could not be reached. Check your connection and try again.' };
    }
  }

  const sendJson = (method: string, path: string, body: unknown) =>
    fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const hotelQuery = `hotel=${encodeURIComponent(hotelId ?? '')}`;

  const saveInsight = (insight: NewSavedInsight) =>
    change(
      () => sendJson('POST', '/api/decisions/insights', insight),
      async (response): Promise<SavedInsight> => savedInsightSchema.parse(await response.json()),
    );
  const removeInsight = (insightId: string) =>
    change(
      () => fetch(`/api/decisions/insights/${encodeURIComponent(insightId)}?${hotelQuery}`, { method: 'DELETE' }),
      async () => undefined,
    );
  const createAction = (action: NewDecisionAction) =>
    change(
      () => sendJson('POST', '/api/decisions/actions', action),
      async (response): Promise<DecisionAction> => decisionActionSchema.parse(await response.json()),
    );
  const updateAction = (actionId: string, patch: DecisionActionPatch) =>
    change(
      () => sendJson('PATCH', `/api/decisions/actions/${encodeURIComponent(actionId)}?${hotelQuery}`, patch),
      async (response): Promise<DecisionAction> => decisionActionSchema.parse(await response.json()),
    );
  const deleteAction = (actionId: string) =>
    change(
      () => fetch(`/api/decisions/actions/${encodeURIComponent(actionId)}?${hotelQuery}`, { method: 'DELETE' }),
      async () => undefined,
    );

  const decisions = state.status === 'ready' ? state.decisions : null;
  const savedBySourceKey = useMemo(() => new Map((decisions?.insights ?? []).map((insight) => [insight.sourceKey, insight])), [decisions]);
  const openActions = (decisions?.actions ?? []).filter((action) => action.status === 'todo' || action.status === 'in_progress');
  const openActionCount = openActions.length;
  /** Open actions whose due date has passed. */
  const overdueActionCount = today ? openActions.filter((action) => action.dueDate !== null && action.dueDate < today).length : 0;
  const savedInsightCount = decisions?.insights.length ?? 0;

  return {
    state,
    reload,
    savedBySourceKey,
    openActionCount,
    overdueActionCount,
    savedInsightCount,
    saveInsight,
    removeInsight,
    createAction,
    updateAction,
    deleteAction,
  };
}

export type DecisionsStore = ReturnType<typeof useDecisions>;
