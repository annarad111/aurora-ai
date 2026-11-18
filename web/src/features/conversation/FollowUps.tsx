import type { RunCompletion } from '../../stream/run-reducer';

interface FollowUpsProps {
  questions: string[];
  completion: RunCompletion | null;
  onAskQuestion: (question: string) => void;
}

const PROVIDER_LABELS: Record<RunCompletion['provider'], string> = {
  llm: 'Workers AI',
  scripted: 'Scripted narrative',
};

/** Suggested next questions, plus a line saying how the answer was produced. */
export function FollowUps({ questions, completion, onAskQuestion }: FollowUpsProps) {
  return (
    <div className="follow-ups">
      <span className="follow-ups__label">Suggested next</span>
      <div className="follow-ups__list">
        {questions.map((question) => (
          <button key={question} type="button" className="follow-up" onClick={() => onAskQuestion(question)}>
            {question}
          </button>
        ))}
      </div>
      {completion && (
        <span className="follow-ups__meta">
          Answered in {(completion.durationMs / 1000).toFixed(1)} s · {PROVIDER_LABELS[completion.provider]} ·{' '}
          {completion.verifiedFigureCount} figures matched to tool output
        </span>
      )}
    </div>
  );
}
