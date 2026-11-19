import type { RunCompletion } from '../../stream/run-reducer';

interface FollowUpsProps {
  questions: string[];
  /** The selected figure, when the questions are about it ("Suggested next, based on Occupancy 62.0%"). */
  basedOnLabel: string | null;
  completion: RunCompletion | null;
  /** Replaces "Suggested next", e.g. "You could ask" after a greeting. */
  label?: string;
  onAskQuestion: (question: string) => void;
}

const PROVIDER_LABELS: Record<RunCompletion['provider'], string> = {
  llm: 'written with Workers AI',
  scripted: 'written from templates',
};

/** Suggested next questions, plus a line saying how the answer was produced. */
export function FollowUps({ questions, basedOnLabel, completion, label, onAskQuestion }: FollowUpsProps) {
  return (
    <div className="follow-ups">
      <span className="follow-ups__label">{basedOnLabel ? `Suggested next, based on ${basedOnLabel}` : (label ?? 'Suggested next')}</span>
      <div className="follow-ups__list">
        {questions.map((question) => (
          <button key={question} type="button" className="follow-up" onClick={() => onAskQuestion(question)}>
            {question}
          </button>
        ))}
      </div>
      {completion && (
        <span className="follow-ups__meta" title={completion.fallbackReason}>
          Answered in {(completion.durationMs / 1000).toFixed(1)} s · {PROVIDER_LABELS[completion.provider]}
          {completion.fallbackReason && ' (model unavailable)'} · {completion.verifiedFigureCount} figures checked against your data
        </span>
      )}
    </div>
  );
}
