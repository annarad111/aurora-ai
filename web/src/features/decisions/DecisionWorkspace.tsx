import {
  ACTION_STATUS_LABELS,
  ACTION_STATUSES,
  formatPeriodLabel,
  type ActionOutcome,
  type ActionPriority,
  type ActionStatus,
  type DecisionAction,
  type InvestigationContext,
  type SavedInsight,
} from '@aurora/shared';
import { useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { formatMeasureValue } from '../briefing/briefing-display';
import { ActionEditor, draftFromAction, draftFromSuggestion, PRIORITY_LABELS, type ActionDraft } from './ActionEditor';
import { suggestActionFor } from './insight-sources';
import type { DecisionsStore } from './useDecisions';

// ---------------------------------------------------------------------------
// The decision workspace: saved insights, the actions decided on, and what
// the data showed afterwards. Insight → action → outcome, in one list.
//
// Three kinds of information are kept apart on screen:
//   figures from the data (saved and observed values)
//   decisions the user recorded (actions, owners, notes)
//   what is not known (whether an action caused a change)
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | ActionStatus;
type PriorityFilter = 'all' | ActionPriority;

interface DecisionWorkspaceProps {
  hotelName: string;
  store: DecisionsStore;
  onOpenConversation: (conversationId: string) => void;
  onInvestigateAgain: (question: string, context: InvestigationContext | null) => void;
}

export function DecisionWorkspace({ hotelName, store, onOpenConversation, onInvestigateAgain }: DecisionWorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const { state } = store;

  if (state.status === 'loading') {
    return (
      <section className="decision-workspace" aria-busy="true" aria-label="Decisions">
        <WorkspaceHeader hotelName={hotelName} />
        <div className="saved-insight saved-insight--skeleton" aria-hidden="true">
          <span className="skeleton skeleton--line skeleton--short" />
          <span className="skeleton skeleton--line" />
        </div>
      </section>
    );
  }
  if (state.status === 'failed') {
    return (
      <section className="decision-workspace" aria-label="Decisions">
        <WorkspaceHeader hotelName={hotelName} />
        <div className="run-banner run-banner--error" role="alert">
          <span>{state.message}</span>
          <button type="button" className="run-banner__action" onClick={() => void store.reload()}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  const { insights, actions, outcomes, unreadableRecordCount } = state.decisions;
  const matchesFilters = (action: DecisionAction) =>
    (statusFilter === 'all' || action.status === statusFilter) && (priorityFilter === 'all' || action.priority === priorityFilter);
  const isFiltering = statusFilter !== 'all' || priorityFilter !== 'all';
  const visibleInsights = insights
    .map((insight) => ({ insight, actions: actions.filter((action) => action.insightId === insight.id) }))
    .filter(({ actions: insightActions }) => !isFiltering || insightActions.some(matchesFilters))
    .reverse();
  const openCount = actions.filter((action) => action.status === 'todo' || action.status === 'in_progress').length;
  const completedCount = actions.filter((action) => action.status === 'completed').length;

  return (
    <section className="decision-workspace" aria-label="Decisions">
      <WorkspaceHeader hotelName={hotelName} />

      <p className="decision-workspace__summary">
        {insights.length} saved insight{insights.length === 1 ? '' : 's'} · {openCount} open action{openCount === 1 ? '' : 's'} · {completedCount} completed
      </p>

      {unreadableRecordCount > 0 && (
        <p className="morning-briefing__notice" role="status">
          {unreadableRecordCount} saved record{unreadableRecordCount === 1 ? '' : 's'} could not be read (an older or damaged format) and {unreadableRecordCount === 1 ? 'is' : 'are'} not shown.
        </p>
      )}

      {insights.length > 0 && (
        <div className="decision-filters">
          <div className="decision-filters__statuses" role="group" aria-label="Filter actions by status">
            {(['all', ...ACTION_STATUSES] as const).map((status) => (
              <button
                key={status}
                type="button"
                className="decision-filters__chip"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all' ? 'All' : ACTION_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <label className="decision-filters__priority">
            <span>Priority</span>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}>
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
      )}

      {insights.length === 0 ? (
        <div className="morning-briefing__empty">
          <p>Nothing saved yet. Save an insight from the morning briefing or from an answer, then decide what to do about it here.</p>
        </div>
      ) : visibleInsights.length === 0 ? (
        <p className="morning-briefing__empty">No actions match these filters.</p>
      ) : (
        <ol className="decision-workspace__list">
          {visibleInsights.map(({ insight, actions: insightActions }) => (
            <li key={insight.id}>
              <SavedInsightCard
                insight={insight}
                actions={isFiltering ? insightActions.filter(matchesFilters) : insightActions}
                hasActions={insightActions.length > 0}
                outcomes={outcomes}
                store={store}
                onOpenConversation={onOpenConversation}
                onInvestigateAgain={onInvestigateAgain}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function WorkspaceHeader({ hotelName }: { hotelName: string }) {
  return (
    <header className="decision-workspace__header">
      <p className="morning-briefing__eyebrow">{hotelName}</p>
      <h1 className="decision-workspace__title">Decisions</h1>
      <p className="decision-workspace__description">
        Insights you saved, what you decided to do about them, and what the data showed afterwards. Stored in Aurora’s database for this hotel, so
        everyone using this demo sees the same list.
      </p>
    </header>
  );
}

interface SavedInsightCardProps {
  insight: SavedInsight;
  actions: DecisionAction[];
  hasActions: boolean;
  outcomes: Record<string, ActionOutcome>;
  store: DecisionsStore;
  onOpenConversation: (conversationId: string) => void;
  onInvestigateAgain: (question: string, context: InvestigationContext | null) => void;
}

function SavedInsightCard({ insight, actions, hasActions, outcomes, store, onOpenConversation, onInvestigateAgain }: SavedInsightCardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { measure } = insight;

  async function createFromDraft(draft: ActionDraft, isSuggestion: boolean): Promise<string | null> {
    const result = await store.createAction({
      hotelId: insight.hotelId,
      insightId: insight.id,
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      status: draft.status,
      owner: draft.owner.trim() === '' ? null : draft.owner.trim(),
      dueDate: draft.dueDate === '' ? null : draft.dueDate,
      notes: draft.notes,
      startedFromSuggestion: isSuggestion,
    });
    if (!result.ok) return result.message;
    setIsCreating(false);
    setMessage('Action created.');
    return null;
  }

  async function remove() {
    const result = await store.removeInsight(insight.id);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <article className="saved-insight" aria-labelledby={`saved-${insight.id}`}>
      <div className="saved-insight__tags">
        <span className="saved-insight__origin">{insight.origin === 'briefing' ? 'Morning briefing' : 'From a conversation'}</span>
        <span className="saved-insight__date">Saved {new Date(insight.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
      </div>
      <h2 className="saved-insight__title" id={`saved-${insight.id}`}>
        {insight.title}
      </h2>

      {measure && (
        <p className="saved-insight__measure">
          <span className="saved-insight__value">{formatMeasureValue(measure.unit, measure.value)}</span>
          <span className="saved-insight__comparison">
            {measure.label}
            {measure.baseline !== null && ` vs ${formatMeasureValue(measure.unit, measure.baseline)} ${measure.baselineLabel ?? ''}`}
            {insight.period && ` · ${formatPeriodLabel(insight.period)}`}
          </span>
        </p>
      )}

      <details className="saved-insight__details">
        <summary>Description and evidence</summary>
        {insight.description && <p>{insight.description}</p>}
        <ul>
          {insight.evidence.map((reference) => (
            <li key={`${reference.label}-${reference.factId ?? ''}`}>{reference.label}</li>
          ))}
        </ul>
      </details>

      <div className="saved-insight__buttons">
        {!isCreating && (
          <button type="button" className="primary-button" onClick={() => setIsCreating(true)}>
            Create action
          </button>
        )}
        {insight.sourceConversationId && (
          <button type="button" className="secondary-button" onClick={() => onOpenConversation(insight.sourceConversationId!)}>
            Open the conversation
          </button>
        )}
        {insight.investigation && (
          <button type="button" className="secondary-button" onClick={() => onInvestigateAgain(insight.investigation!.question, insight.investigation!.context)}>
            Investigate again on today’s data
          </button>
        )}
        {!hasActions && (
          <button type="button" className="text-button" onClick={() => void remove()}>
            Remove
          </button>
        )}
      </div>
      <p className="save-insight__message" role="status">
        {message}
      </p>

      {isCreating && (
        <ActionEditor
          initialDraft={draftFromSuggestion(suggestActionFor(insight))}
          isSuggestion
          submitLabel="Save action"
          onSubmit={(draft) => createFromDraft(draft, true)}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {actions.length > 0 && (
        <ul className="saved-insight__actions" aria-label="Actions">
          {actions.map((action) => (
            <li key={action.id}>
              <ActionItem action={action} outcome={outcomes[action.id]} store={store} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ActionItem({ action, outcome, store }: { action: DecisionAction; outcome: ActionOutcome | undefined; store: DecisionsStore }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function changeStatus(status: ActionStatus) {
    const result = await store.updateAction(action.id, { status });
    setMessage(result.ok ? `Marked ${ACTION_STATUS_LABELS[status].toLowerCase()}.` : result.message);
  }

  async function saveEdit(draft: ActionDraft): Promise<string | null> {
    const result = await store.updateAction(action.id, {
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      status: draft.status,
      owner: draft.owner.trim() === '' ? null : draft.owner.trim(),
      dueDate: draft.dueDate === '' ? null : draft.dueDate,
      notes: draft.notes,
    });
    if (!result.ok) return result.message;
    setIsEditing(false);
    return null;
  }

  if (isEditing) {
    return <ActionEditor initialDraft={draftFromAction(action)} isSuggestion={false} submitLabel="Save changes" onSubmit={saveEdit} onCancel={() => setIsEditing(false)} />;
  }

  return (
    <div className={joinClassNames('decision-action', `decision-action--${action.status}`)}>
      <div className="decision-action__top">
        <span className={`decision-action__priority decision-action__priority--${action.priority}`}>{PRIORITY_LABELS[action.priority]}</span>
        <span className="decision-action__recorded">Your decision{action.startedFromSuggestion ? ' (from Aurora’s suggestion)' : ''}</span>
      </div>
      <p className="decision-action__title">{action.title}</p>
      {action.description && <p className="decision-action__description">{action.description}</p>}
      <p className="decision-action__meta">
        {action.owner && <span>Owner: {action.owner}</span>}
        {action.dueDate && <span>Due {formatPeriodLabel({ from: action.dueDate, to: action.dueDate })}</span>}
        {action.completedAt && <span>Completed {new Date(action.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
      </p>
      {action.notes && <p className="decision-action__notes">{action.notes}</p>}

      <div className="decision-action__controls">
        <label className="decision-action__status">
          <span className="visually-hidden">Status of {action.title}</span>
          <select value={action.status} onChange={(event) => void changeStatus(event.target.value as ActionStatus)}>
            {ACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ACTION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="text-button" onClick={() => setIsEditing(true)}>
          Edit
        </button>
        {isConfirmingDelete ? (
          <span className="decision-action__confirm">
            Delete this action for good?
            <button
              type="button"
              className="text-button text-button--danger"
              onClick={async () => {
                const result = await store.deleteAction(action.id);
                if (!result.ok) setMessage(result.message);
              }}
            >
              Delete
            </button>
            <button type="button" className="text-button" onClick={() => setIsConfirmingDelete(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="text-button" onClick={() => setIsConfirmingDelete(true)}>
            Delete
          </button>
        )}
      </div>
      <p className="save-insight__message" role="status">
        {message}
      </p>

      {action.status === 'completed' && outcome && <OutcomeReview outcome={outcome} />}
    </div>
  );
}

/** What the data shows since the action was completed: observed, side by side, cause unknown. */
export function OutcomeReview({ outcome }: { outcome: ActionOutcome }) {
  if (outcome.status === 'not_measurable') {
    return (
      <div className="outcome-review outcome-review--pending">
        <span className="outcome-review__label">Outcome</span>
        <p>{outcome.reason}</p>
      </div>
    );
  }
  return (
    <div className="outcome-review">
      <span className="outcome-review__label">Observed in the data</span>
      <p className="outcome-review__figures">
        {outcome.label}: <strong>{formatMeasureValue(outcome.unit, outcome.before)}</strong> ({outcome.beforeLabel}) →{' '}
        <strong>{formatMeasureValue(outcome.unit, outcome.after)}</strong> ({outcome.afterLabel})
      </p>
      <p className="outcome-review__caveat">Not verified as caused by this action: other things changed in the same nights.</p>
    </div>
  );
}
