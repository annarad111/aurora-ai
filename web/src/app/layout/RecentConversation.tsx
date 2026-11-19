import { MAXIMUM_CONVERSATION_TITLE_LENGTH, type ConversationSummary } from '@aurora/shared';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { PencilIcon, TrashIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import { describeWhenAsked } from '../../lib/relative-time';
import type { ConversationChangeError } from '../useConversationList';

interface RecentConversationProps {
  summary: ConversationSummary;
  isActive: boolean;
  onOpen: () => void;
  onRename: (title: string) => Promise<ConversationChangeError>;
  onDelete: () => Promise<ConversationChangeError>;
}

type Mode = 'idle' | 'renaming' | 'confirming_delete';

/**
 * One conversation in "Recent": opens it, and on hover or focus offers to
 * rename it (Enter saves, Escape cancels) or delete it (asks first: deleting
 * cannot be undone).
 */
export function RecentConversation({ summary, isActive, onOpen, onRename, onDelete }: RecentConversationProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [draftTitle, setDraftTitle] = useState(summary.title);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === 'renaming') titleInput.current?.select();
  }, [mode]);

  function close() {
    setMode('idle');
    setError(null);
    // Back to where the user was, so keyboard users do not lose their place.
    requestAnimationFrame(() => renameButton.current?.focus());
  }

  async function saveTitle(event: FormEvent) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (title === '') {
      setError('The title cannot be empty.');
      return;
    }
    if (title === summary.title) {
      close();
      return;
    }
    setIsBusy(true);
    const problem = await onRename(title);
    setIsBusy(false);
    if (problem) setError(problem);
    else close();
  }

  async function confirmDelete() {
    setIsBusy(true);
    const problem = await onDelete();
    setIsBusy(false);
    if (problem) setError(problem);
  }

  function cancelOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  if (mode === 'renaming') {
    return (
      <form className="recent-question recent-question--editing" onSubmit={(event) => void saveTitle(event)} onKeyDown={cancelOnEscape}>
        <label className="visually-hidden" htmlFor={`rename-${summary.id}`}>
          Title of the conversation
        </label>
        <input
          id={`rename-${summary.id}`}
          ref={titleInput}
          className="recent-question__input"
          value={draftTitle}
          maxLength={MAXIMUM_CONVERSATION_TITLE_LENGTH}
          disabled={isBusy}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={(event) => {
            // Clicking Save or Cancel keeps the form; clicking elsewhere cancels.
            if (!event.currentTarget.form?.contains(event.relatedTarget as Node | null)) close();
          }}
        />
        <span className="recent-question__edit-buttons">
          <button type="submit" className="text-button" disabled={isBusy}>
            Save
          </button>
          <button type="button" className="text-button" onClick={close}>
            Cancel
          </button>
        </span>
        {error && (
          <span className="recent-question__error" role="alert">
            {error}
          </span>
        )}
      </form>
    );
  }

  if (mode === 'confirming_delete') {
    return (
      <div className="recent-question recent-question--confirming" role="group" aria-label={`Delete “${summary.title}”?`} onKeyDown={cancelOnEscape}>
        <span className="recent-question__text">{summary.title}</span>
        <span className="recent-question__confirm-text">Delete this chat for good?</span>
        <span className="recent-question__edit-buttons">
          {/* Focus starts on Keep, the safe choice. */}
          <button type="button" className="text-button" onClick={close} autoFocus>
            Keep
          </button>
          <button type="button" className="text-button text-button--danger" disabled={isBusy} onClick={() => void confirmDelete()}>
            {isBusy ? 'Deleting…' : 'Delete'}
          </button>
        </span>
        {error && (
          <span className="recent-question__error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={joinClassNames('recent-question', isActive && 'recent-question--active')}>
      <button type="button" className="recent-question__open" aria-current={isActive ? 'true' : undefined} onClick={onOpen}>
        <span className="recent-question__text">{summary.title}</span>
        <span className="recent-question__date">
          {describeWhenAsked(summary.updatedAt)}
          {summary.turnCount > 1 && ` · ${summary.turnCount} messages`}
        </span>
      </button>
      <span className="recent-question__tools">
        <button
          ref={renameButton}
          type="button"
          className="recent-question__tool"
          aria-label={`Rename “${summary.title}”`}
          title="Rename"
          onClick={() => {
            setDraftTitle(summary.title);
            setMode('renaming');
          }}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="recent-question__tool recent-question__tool--danger"
          aria-label={`Delete “${summary.title}”`}
          title="Delete"
          onClick={() => setMode('confirming_delete')}
        >
          <TrashIcon />
        </button>
      </span>
    </div>
  );
}
