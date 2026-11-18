import type { RunPhase } from '../../stream/run-reducer';

export type { RunPhase };

/** The status label in the conversation header. Always shown with a coloured dot (see _conversation-header.scss). */
export const RUN_PHASE_LABELS: Record<RunPhase, string> = {
  idle: 'Ready',
  streaming: 'Analysing',
  done: 'Answer verified',
  cancelled: 'Stopped',
  error: 'Interrupted',
};
