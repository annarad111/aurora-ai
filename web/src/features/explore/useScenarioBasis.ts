import { simulateScenarioOutputSchema, type ScenarioBasis } from '@aurora/shared';
import { useEffect, useState } from 'react';

const SIMULATE_ENDPOINT = '/api/simulate';

export type ScenarioBasisState =
  | { status: 'loading' }
  | { status: 'ready'; basis: ScenarioBasis }
  | { status: 'error'; message: string };

/**
 * Loads what a what-if starts from (rooms on the books, last year's pace,
 * channel mix, commissions) once, through the simulate_scenario tool.
 * The sliders then recalculate in the browser with the same function.
 */
export function useScenarioBasis(hotelId: string, stayFrom: string, stayTo: string): ScenarioBasisState {
  const [state, setState] = useState<ScenarioBasisState>({ status: 'loading' });

  useEffect(() => {
    const abortController = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      try {
        const response = await fetch(SIMULATE_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hotelId, stayFrom, stayTo }),
          signal: abortController.signal,
        });
        if (!response.ok) {
          setState({ status: 'error', message: `The simulation could not start (the server answered ${response.status}).` });
          return;
        }
        const parsed = simulateScenarioOutputSchema.safeParse(await response.json());
        setState(parsed.success ? { status: 'ready', basis: parsed.data.basis } : { status: 'error', message: 'The simulation data was not in the expected format.' });
      } catch {
        if (!abortController.signal.aborted) setState({ status: 'error', message: 'Aurora could not be reached for the simulation.' });
      }
    })();
    return () => abortController.abort();
  }, [hotelId, stayFrom, stayTo]);

  return state;
}
