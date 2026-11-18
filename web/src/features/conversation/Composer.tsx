import { useState, type FormEvent } from 'react';
import { SendArrowIcon } from '../../design-system/icons';

const MAX_QUESTION_LENGTH = 280;

interface ComposerProps {
  isStreaming: boolean;
  /** True until the workspace (and so the hotel) has loaded. */
  isDisabled?: boolean;
  onAskQuestion: (question: string) => void;
  onStop: () => void;
}

/**
 * The question input at the bottom of the conversation.
 * While an answer streams, the input is disabled and the send button becomes "Stop".
 */
export function Composer({ isStreaming, isDisabled = false, onAskQuestion, onStop }: ComposerProps) {
  const [draftQuestion, setDraftQuestion] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = draftQuestion.trim();
    if (!trimmedQuestion || isDisabled) return;
    onAskQuestion(trimmedQuestion);
    setDraftQuestion('');
  }

  return (
    <div className="composer">
      <form className="composer__form" onSubmit={handleSubmit}>
        <input
          className="composer__input"
          value={draftQuestion}
          onChange={(event) => setDraftQuestion(event.target.value)}
          disabled={isStreaming || isDisabled}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="Ask about revenue, pace, channels or segments"
          aria-label="Ask Aurora"
        />
        {isStreaming ? (
          <button type="button" className="composer__stop-button" onClick={onStop}>
            <span className="composer__stop-square" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button type="submit" className="composer__send-button" aria-label="Send">
            <SendArrowIcon />
          </button>
        )}
      </form>
    </div>
  );
}
