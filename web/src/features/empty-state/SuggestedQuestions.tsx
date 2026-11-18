import { CURRENT_PROPERTY, SUGGESTED_QUESTIONS } from '../../app/workspace-content';

interface SuggestedQuestionsProps {
  onAskQuestion: (question: string) => void;
}

/** The idle screen: a heading and four suggestion cards that each start a run. */
export function SuggestedQuestions({ onAskQuestion }: SuggestedQuestionsProps) {
  return (
    <div className="idle-state">
      <div className="idle-state__intro">
        <h1 className="idle-state__title">What do you want to understand about {CURRENT_PROPERTY.name}?</h1>
        <p className="idle-state__description">
          Aurora answers with the summary first, then the numbers behind it. Every figure links to the tool and
          formula that produced it.
        </p>
      </div>

      <div className="suggestion-grid">
        {SUGGESTED_QUESTIONS.map((suggestion) => (
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
