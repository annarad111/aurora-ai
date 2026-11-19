import {
  ACTION_PRIORITIES,
  type DecisionActionDigest,
  type GetDecisionsInput,
  type GetDecisionsOutput,
} from '@aurora/shared';
import { listDecisions } from '../decisions/decision-service';
import { requireHotel, type ToolContext } from './tool-context';

/** Open first, then completed, then dismissed. */
const STATUS_ORDER = { in_progress: 0, todo: 1, completed: 2, dismissed: 3 } as const;

function compareActions(first: DecisionActionDigest, second: DecisionActionDigest): number {
  const isOpen = (action: DecisionActionDigest) => action.status === 'todo' || action.status === 'in_progress';
  if (isOpen(first) !== isOpen(second)) return isOpen(first) ? -1 : 1;
  if (isOpen(first)) {
    const byPriority = ACTION_PRIORITIES.indexOf(first.priority) - ACTION_PRIORITIES.indexOf(second.priority);
    if (byPriority !== 0) return byPriority;
    // An action with a due date comes before one without, the earliest first.
    if (first.dueDate !== second.dueDate) return (first.dueDate ?? '9999-12-31').localeCompare(second.dueDate ?? '9999-12-31');
    return STATUS_ORDER[first.status] - STATUS_ORDER[second.status];
  }
  const byStatus = STATUS_ORDER[first.status] - STATUS_ORDER[second.status];
  return byStatus !== 0 ? byStatus : second.updatedAt.localeCompare(first.updatedAt);
}

/**
 * get_decisions: the Decisions workspace as data, for the chat and MCP agents.
 * Read-only. Titles, owners and notes are what users wrote.
 */
export async function getDecisions(input: GetDecisionsInput, context: ToolContext): Promise<GetDecisionsOutput> {
  await requireHotel(context, input.hotelId);
  const { insights, actions, outcomes, unreadableRecordCount } = await listDecisions(context, input.hotelId);
  const insightTitleById = new Map(insights.map((insight) => [insight.id, insight.title]));

  const digests: DecisionActionDigest[] = actions.map((action) => ({
    ...action,
    insightTitle: insightTitleById.get(action.insightId) ?? 'An insight that is no longer saved',
    isOverdue: (action.status === 'todo' || action.status === 'in_progress') && action.dueDate !== null && action.dueDate < context.today,
    outcome: outcomes[action.id] ?? null,
  }));

  const filtered = digests.filter(
    (action) => (!input.statuses || input.statuses.includes(action.status)) && (!input.priorities || input.priorities.includes(action.priority)),
  );

  return {
    today: context.today,
    insights: insights.map((insight) => ({ ...insight, actionCount: actions.filter((action) => action.insightId === insight.id).length })),
    actions: filtered.sort(compareActions),
    counts: {
      savedInsights: insights.length,
      todo: digests.filter((action) => action.status === 'todo').length,
      inProgress: digests.filter((action) => action.status === 'in_progress').length,
      completed: digests.filter((action) => action.status === 'completed').length,
      dismissed: digests.filter((action) => action.status === 'dismissed').length,
      overdue: digests.filter((action) => action.isOverdue).length,
    },
    isFiltered: Boolean(input.statuses || input.priorities),
    unreadableRecordCount,
  };
}
