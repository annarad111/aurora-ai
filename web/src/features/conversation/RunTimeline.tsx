import { useEffect, useId, useState } from 'react';
import { CheckIcon } from '../../design-system/icons';
import type { RunCompletion, RunPhase, RunStep } from '../../stream/run-reducer';

interface RunTimelineProps {
  steps: RunStep[];
  phase: RunPhase;
  completion: RunCompletion | null;
}

function StepStatusIcon({ status }: { status: RunStep['status'] }) {
  switch (status) {
    case 'done':
      return (
        <span className="run-timeline__icon run-timeline__icon--done">
          <CheckIcon />
        </span>
      );
    case 'running':
      return <span className="run-timeline__pulse" />;
    case 'pending':
      return <span className="run-timeline__ring" />;
    case 'stopped':
      return <span className="run-timeline__dash" />;
    case 'failed':
      return <span className="run-timeline__failed">!</span>;
  }
}

const STEP_STATUS_LABELS: Record<RunStep['status'], string> = {
  pending: 'Waiting',
  running: 'In progress',
  done: 'Done',
  stopped: 'Stopped',
  failed: 'Failed',
};

/** The one-line summary next to "Aurora", which changes as the run moves on. */
function describeProgress(steps: RunStep[], phase: RunPhase, completion: RunCompletion | null): string {
  const finishedCount = steps.filter((step) => step.status === 'done').length;
  const runningStep = steps.find((step) => step.status === 'running');

  switch (phase) {
    case 'streaming':
      if (runningStep) return `${runningStep.label}…`;
      return steps.length > 0 && finishedCount === steps.length ? 'Writing the explanation…' : 'Planning the analysis…';
    case 'cancelled':
      return steps.length === 0 ? 'Stopped before the analysis started' : `Stopped after ${finishedCount} of ${steps.length} steps`;
    case 'error':
      return steps.length === 0 ? 'Interrupted before the analysis started' : `Interrupted after ${finishedCount} of ${steps.length} steps`;
    case 'done': {
      const toolCount = new Set(steps.map((step) => step.tool)).size;
      const seconds = ((completion?.durationMs ?? 0) / 1000).toFixed(1);
      return `${steps.length} steps · ${seconds} s · ${toolCount} tools`;
    }
    case 'idle':
      return '';
  }
}

/** The collapsible list of what Aurora is doing. Collapses by itself when the answer is complete. */
export function RunTimeline({ steps, phase, completion }: RunTimelineProps) {
  // Restored answers arrive already done, so they start collapsed.
  const [isExpanded, setIsExpanded] = useState(phase !== 'done');
  // Unique per answer: a conversation has many timelines.
  const stepsListId = useId();

  useEffect(() => {
    if (phase === 'streaming') setIsExpanded(true);
    if (phase === 'done') setIsExpanded(false);
  }, [phase]);

  return (
    <div className="run-timeline">
      <button
        type="button"
        className="run-timeline__header"
        aria-expanded={isExpanded}
        aria-controls={stepsListId}
        onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
      >
        <span className="run-timeline__title-group">
          <span className="run-timeline__title">Aurora</span>
          <span className="run-timeline__summary">{describeProgress(steps, phase, completion)}</span>
        </span>
        <span className="run-timeline__toggle">{isExpanded ? 'Hide steps' : 'Show steps'}</span>
      </button>

      {isExpanded && (
        // Announces step changes to screen readers, not every word of the text.
        <ol id={stepsListId} className="run-timeline__steps" aria-live="polite">
          {steps.map((step) => (
            <li key={step.stepId} className={`run-timeline__step run-timeline__step--${step.status}`}>
              <span className="run-timeline__status" aria-label={STEP_STATUS_LABELS[step.status]}>
                <StepStatusIcon status={step.status} />
              </span>
              <span className="run-timeline__label">{step.label}</span>
              <span className="run-timeline__tool">{step.tool}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
