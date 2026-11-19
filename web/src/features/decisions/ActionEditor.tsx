import {
  ACTION_PRIORITIES,
  ACTION_STATUS_LABELS,
  ACTION_STATUSES,
  type ActionPriority,
  type ActionStatus,
  type DecisionAction,
} from '@aurora/shared';
import { useId, useState, type FormEvent } from 'react';
import type { ActionSuggestion } from './insight-sources';

export interface ActionDraft {
  title: string;
  description: string;
  priority: ActionPriority;
  status: ActionStatus;
  owner: string;
  dueDate: string;
  notes: string;
}

export const PRIORITY_LABELS: Record<ActionPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function draftFromSuggestion(suggestion: ActionSuggestion): ActionDraft {
  return { title: suggestion.title, description: suggestion.description, priority: suggestion.priority, status: 'todo', owner: '', dueDate: '', notes: '' };
}

export function draftFromAction(action: DecisionAction): ActionDraft {
  return {
    title: action.title,
    description: action.description,
    priority: action.priority,
    status: action.status,
    owner: action.owner ?? '',
    dueDate: action.dueDate ?? '',
    notes: action.notes,
  };
}

interface ActionEditorProps {
  initialDraft: ActionDraft;
  /** True when the draft is Aurora's suggestion: it says so until the user saves. */
  isSuggestion: boolean;
  submitLabel: string;
  onSubmit: (draft: ActionDraft) => Promise<string | null>;
  onCancel: () => void;
}

/** Creating or editing an action. Returns focus to the title on errors; nothing is stored until Save. */
export function ActionEditor({ initialDraft, isSuggestion, submitLabel, onSubmit, onCancel }: ActionEditorProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const id = useId();
  const update = <Field extends keyof ActionDraft>(field: Field, value: ActionDraft[Field]) => setDraft((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (draft.title.trim() === '') {
      setError('Give the action a title.');
      document.getElementById(`${id}-title`)?.focus();
      return;
    }
    setIsSaving(true);
    const problem = await onSubmit(draft);
    setIsSaving(false);
    setError(problem);
  }

  return (
    <form className="action-editor" onSubmit={(event) => void handleSubmit(event)} aria-label={submitLabel}>
      {isSuggestion && (
        <p className="action-editor__suggestion">
          <strong>Suggested by Aurora</strong> from this insight’s figure. It is only a starting point: edit it, and nothing is recorded until you save.
        </p>
      )}

      <label className="action-editor__field action-editor__field--wide">
        <span>Action</span>
        <input id={`${id}-title`} value={draft.title} maxLength={160} onChange={(event) => update('title', event.target.value)} required />
      </label>

      <label className="action-editor__field action-editor__field--wide">
        <span>Description</span>
        <textarea rows={2} value={draft.description} maxLength={1200} onChange={(event) => update('description', event.target.value)} />
      </label>

      <label className="action-editor__field">
        <span>Priority</span>
        <select value={draft.priority} onChange={(event) => update('priority', event.target.value as ActionPriority)}>
          {ACTION_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
      </label>

      <label className="action-editor__field">
        <span>Status</span>
        <select value={draft.status} onChange={(event) => update('status', event.target.value as ActionStatus)}>
          {ACTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ACTION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>

      <label className="action-editor__field">
        <span>Owner (optional)</span>
        <input value={draft.owner} maxLength={80} onChange={(event) => update('owner', event.target.value)} />
      </label>

      <label className="action-editor__field">
        <span>Due date (optional)</span>
        <input type="date" value={draft.dueDate} onChange={(event) => update('dueDate', event.target.value)} />
      </label>

      <label className="action-editor__field action-editor__field--wide">
        <span>Notes</span>
        <textarea rows={2} value={draft.notes} maxLength={2000} onChange={(event) => update('notes', event.target.value)} />
      </label>

      {error && (
        <p className="action-editor__error" role="alert">
          {error}
        </p>
      )}

      <div className="action-editor__buttons">
        <button type="submit" className="primary-button" disabled={isSaving}>
          {isSaving ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
