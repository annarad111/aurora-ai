import type { Workspace } from '@aurora/shared';

interface SuggestedQuestionsProps {
  workspace: Workspace;
  onAskQuestion: (question: string) => void;
}

/** Under the briefing: starter questions written from today's data, for anything else. */
export function SuggestedQuestions({ workspace, onAskQuestion }: SuggestedQuestionsProps) {
  return (
    <section className="idle-state" aria-labelledby="suggested-questions-title">
      <div className="idle-state__intro">
        <h2 className="idle-state__title" id="suggested-questions-title">
          What would you like to see today about your business?
        </h2>
        <p className="idle-state__description">
          Ask Aurora anything about {workspace.hotel.name}, the way you would ask a colleague. Every figure links to the
          tool and formula that produced it.
        </p>
      </div>

      <div className="suggestion-grid">
        {workspace.suggestions.map((suggestion) => (
          <button
            key={suggestion.question}
            type="button"
            className="suggestion-card"
            onClick={() => onAskQuestion(suggestion.question)}
          >
            <span className="suggestion-card__tag">{suggestion.topic}</span>
            <span className="suggestion-card__question">{suggestion.question}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
