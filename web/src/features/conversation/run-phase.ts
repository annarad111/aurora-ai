/**
 * Where the current answer is in its life cycle.
 *   idle      nothing asked yet
 *   streaming Aurora is calling tools and writing the answer
 *   done      the answer is complete and every figure was matched to tool output
 *   cancelled the user pressed Stop; the partial answer is kept
 *
 * Step 5 adds "error" and "partial" when the real stream is connected.
 */
export type RunPhase = 'idle' | 'streaming' | 'done' | 'cancelled';

export const RUN_PHASE_LABELS: Record<RunPhase, string> = {
  idle: 'Ready',
  streaming: 'Analysing',
  done: 'Answer verified',
  cancelled: 'Stopped',
};
