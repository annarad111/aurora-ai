import type { RunError, RunPhase } from '../../stream/run-reducer';

interface RunBannerProps {
  phase: RunPhase;
  error: RunError | null;
  onRetry: () => void;
}

/** Shown after Stop or an error. What arrived before stays on screen. */
export function RunBanner({ phase, error, onRetry }: RunBannerProps) {
  if (phase === 'cancelled') {
    return (
      <div className="run-banner run-banner--stopped" role="status">
        <span>Stopped. Everything received so far is kept.</span>
        <button type="button" className="run-banner__action" onClick={onRetry}>
          Run again
        </button>
      </div>
    );
  }

  if (phase === 'error' && error) {
    return (
      <div className="run-banner run-banner--error" role="alert">
        <span>{error.message}</span>
        {error.recoverable && (
          <button type="button" className="run-banner__action" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return null;
}
