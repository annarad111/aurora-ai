import type { RunError, RunPhase } from '../../stream/run-reducer';

interface RunBannerProps {
  phase: RunPhase;
  error: RunError | null;
  /** Null for an older answer of the conversation: only the latest one can be asked again. */
  onRetry: (() => void) | null;
}

/** Shown after Stop or an error. What arrived before stays on screen. */
export function RunBanner({ phase, error, onRetry }: RunBannerProps) {
  if (phase === 'cancelled') {
    return (
      <div className="run-banner run-banner--stopped" role="status">
        <span>Stopped. Everything received so far is kept.</span>
        {onRetry && (
          <button type="button" className="run-banner__action" onClick={onRetry}>
            Run again
          </button>
        )}
      </div>
    );
  }

  if (phase === 'error' && error) {
    return (
      <div className="run-banner run-banner--error" role="alert">
        <span>{error.message}</span>
        {error.recoverable && onRetry && (
          <button type="button" className="run-banner__action" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return null;
}
