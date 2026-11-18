import type { Workspace } from '@aurora/shared';

interface SuggestedQuestionsProps {
  workspace: Workspace;
  onAskQuestion: (question: string) => void;
}

/** The idle screen: a heading and the hotel's starter questions, each of which starts a run. */
export function SuggestedQuestions({ workspace, onAskQuestion }: SuggestedQuestionsProps) {
  return (
    <div className="idle-state">
      <div className="idle-state__intro">
        <h1 className="idle-state__title">What do you want to understand about {workspace.hotel.name}?</h1>
        <p className="idle-state__description">
          Aurora answers with the summary first, then the numbers behind it. Every figure links to the tool and
          formula that produced it.
        </p>
      </div>

      <div className="suggestion-grid">
        {workspace.suggestedQuestions.map((suggestion) => (
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
    </div>
  );
}
