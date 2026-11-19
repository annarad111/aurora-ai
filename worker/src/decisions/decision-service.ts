import { addDays } from '@aurora/analytics';
import {
  DECISION_RECORD_VERSION,
  decisionActionPatchSchema,
  decisionActionSchema,
  formatPeriodLabel,
  savedInsightSchema,
  type ActionOutcome,
  type DecisionAction,
  type DecisionActionPatch,
  type Decisions,
  type NewDecisionAction,
  type NewSavedInsight,
  type SavedInsight,
} from '@aurora/shared';
import type { DecisionRecord } from '../db/hotel-data-repository';
import { callTool } from '../tools/registry';
import type { ToolContext } from '../tools/tool-context';

// ---------------------------------------------------------------------------
// Insight to action: the rules around the stored records.
//
//   - saving the same insight twice keeps one record (by source key)
//   - an insight with actions cannot be removed (its actions would lose their context)
//   - completing an action stamps completedAt; reopening it clears it
//   - a completed action gets an outcome: the same figure on the nights since,
//     side by side with the figure when it was saved, never called a result of the action
// ---------------------------------------------------------------------------

export class DecisionError extends Error {
  constructor(
    readonly status: 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function readRecords(records: DecisionRecord[]) {
  const insights: SavedInsight[] = [];
  const actions: DecisionAction[] = [];
  let unreadableRecordCount = 0;
  for (const record of records) {
    // Records of another format version are not guessed at: they are counted as unreadable.
    const schema = record.kind === 'insight' ? savedInsightSchema : decisionActionSchema;
    let parsed: ReturnType<typeof schema.safeParse> | null = null;
    if (record.recordVersion === DECISION_RECORD_VERSION) {
      try {
        parsed = schema.safeParse(JSON.parse(record.recordJson));
      } catch {
        parsed = null;
      }
    }
    if (!parsed?.success) {
      unreadableRecordCount += 1;
      console.warn(`[Aurora] skipped an unreadable ${record.kind} record (${record.id}, version ${record.recordVersion})`);
      continue;
    }
    if (record.kind === 'insight') insights.push(parsed.data as SavedInsight);
    else actions.push(parsed.data as DecisionAction);
  }
  return { insights, actions, unreadableRecordCount };
}

const MEASURED_BY_QUERY = {
  occupancy: 'occupancy',
  adr: 'adr',
  revpar: 'revpar',
  net_revpar: 'netRevpar',
} as const;

/**
 * The figure of the insight on the data that came in after the action was
 * completed. Totals (revenue, room nights) cover periods of different
 * lengths, so they are not compared; rates and ratios are.
 */
export async function measureOutcome(action: DecisionAction, insight: SavedInsight | undefined, context: ToolContext): Promise<ActionOutcome> {
  if (!insight?.metric || !insight.measure || !action.completedAt) {
    return { status: 'not_measurable', reason: 'This insight has no single figure to follow.' };
  }
  const completedOn = action.completedAt.slice(0, 10);
  const savedLabel = `When saved${insight.period ? `, ${formatPeriodLabel(insight.period)}` : ''}`;
  const { metric, measure } = insight;

  if (metric === 'booking_pace') {
    if (context.today <= completedOn || !insight.period) {
      return { status: 'not_measurable', reason: 'Outcome not yet measurable: bookings have not been counted again since the action was completed.' };
    }
    const pace = await callTool('get_booking_pace', { hotelId: insight.hotelId, stayFrom: insight.period.from, stayTo: insight.period.to }, context);
    return {
      status: 'observed',
      label: measure.label,
      unit: measure.unit,
      before: measure.value,
      beforeLabel: savedLabel,
      after: pace.roomsOnTheBooks,
      afterLabel: `Counted ${formatPeriodLabel({ from: pace.snapshotDate, to: pace.snapshotDate })}`,
    };
  }

  const firstNightAfter = addDays(completedOn, 1);
  if (firstNightAfter > context.today) {
    return { status: 'not_measurable', reason: 'Outcome not yet measurable: there are no results for nights after the action was completed.' };
  }
  const nightsSince = { from: firstNightAfter, to: context.today };

  if (metric in MEASURED_BY_QUERY) {
    const output = await callTool('query_performance', { hotelId: insight.hotelId, period: nightsSince, groupBy: 'none', compareWithLastYear: false }, context);
    return {
      status: 'observed',
      label: measure.label,
      unit: measure.unit,
      before: measure.value,
      beforeLabel: savedLabel,
      after: output.totals[MEASURED_BY_QUERY[metric as keyof typeof MEASURED_BY_QUERY]],
      afterLabel: `Since completed, ${formatPeriodLabel(nightsSince)}`,
    };
  }
  if (metric === 'ota_share') {
    const channelMix = await callTool('get_channel_mix', { hotelId: insight.hotelId, period: nightsSince }, context);
    const ota = channelMix.channels.find((channel) => channel.channel === 'ota');
    if (!ota) return { status: 'not_measurable', reason: 'There is no booking-site revenue since the action was completed.' };
    return {
      status: 'observed',
      label: measure.label,
      unit: measure.unit,
      before: measure.value,
      beforeLabel: savedLabel,
      after: ota.revenueShare,
      afterLabel: `Since completed, ${formatPeriodLabel(nightsSince)}`,
    };
  }
  return {
    status: 'not_measurable',
    reason: 'Totals over periods of different length cannot be compared. Follow a rate such as occupancy or RevPAR instead.',
  };
}

export async function listDecisions(context: ToolContext, hotelId: string): Promise<Decisions> {
  const { insights, actions, unreadableRecordCount } = readRecords(await context.repository.listDecisionRecords(hotelId));
  const insightsById = new Map(insights.map((insight) => [insight.id, insight]));
  const outcomes: Decisions['outcomes'] = {};
  for (const action of actions) {
    if (action.status !== 'completed') continue;
    try {
      outcomes[action.id] = await measureOutcome(action, insightsById.get(action.insightId), context);
    } catch (error) {
      console.warn('[Aurora] could not measure an outcome', error instanceof Error ? error.message : error);
      outcomes[action.id] = { status: 'not_measurable', reason: 'The data needed to measure this could not be read.' };
    }
  }
  return { insights, actions, outcomes, unreadableRecordCount };
}

/** Saves an insight, or returns the one already saved from the same source. */
export async function saveInsight(context: ToolContext, newInsight: NewSavedInsight, now: string): Promise<{ insight: SavedInsight; created: boolean }> {
  const insight: SavedInsight = savedInsightSchema.parse({ ...newInsight, id: crypto.randomUUID(), createdAt: now });
  const result = await context.repository.insertDecisionRecord({
    id: insight.id,
    hotelId: insight.hotelId,
    kind: 'insight',
    sourceKey: insight.sourceKey,
    parentId: null,
    recordVersion: DECISION_RECORD_VERSION,
    recordJson: JSON.stringify(insight),
    createdAt: now,
    updatedAt: now,
  });
  if (result === 'inserted') return { insight, created: true };
  const { insights } = readRecords(await context.repository.listDecisionRecords(newInsight.hotelId));
  const existing = insights.find((candidate) => candidate.sourceKey === newInsight.sourceKey);
  if (!existing) throw new DecisionError(409, 'insight_unreadable', 'This insight was saved before, but its record can no longer be read.');
  return { insight: existing, created: false };
}

export async function removeInsight(context: ToolContext, hotelId: string, insightId: string): Promise<void> {
  const { actions } = readRecords(await context.repository.listDecisionRecords(hotelId));
  if (actions.some((action) => action.insightId === insightId)) {
    throw new DecisionError(409, 'insight_has_actions', 'This insight has actions. Delete them first, so no decision loses its context.');
  }
  if (!(await context.repository.deleteDecisionRecord(hotelId, insightId))) throw new DecisionError(404, 'unknown_insight', 'No saved insight with this id');
}

export async function createAction(context: ToolContext, newAction: NewDecisionAction, now: string): Promise<DecisionAction> {
  const { insights } = readRecords(await context.repository.listDecisionRecords(newAction.hotelId));
  if (!insights.some((insight) => insight.id === newAction.insightId)) {
    throw new DecisionError(404, 'unknown_insight', 'Save the insight before creating an action for it.');
  }
  const action = decisionActionSchema.parse({
    ...newAction,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    completedAt: newAction.status === 'completed' ? now : null,
  });
  await context.repository.insertDecisionRecord({
    id: action.id,
    hotelId: action.hotelId,
    kind: 'action',
    sourceKey: null,
    parentId: action.insightId,
    recordVersion: DECISION_RECORD_VERSION,
    recordJson: JSON.stringify(action),
    createdAt: now,
    updatedAt: now,
  });
  return action;
}

export async function updateAction(context: ToolContext, hotelId: string, actionId: string, patch: DecisionActionPatch, now: string): Promise<DecisionAction> {
  const { actions } = readRecords(await context.repository.listDecisionRecords(hotelId));
  const current = actions.find((action) => action.id === actionId);
  if (!current) throw new DecisionError(404, 'unknown_action', 'No action with this id');
  const changes = decisionActionPatchSchema.parse(patch);
  const nextStatus = changes.status ?? current.status;
  const completedAt = nextStatus === 'completed' ? (current.status === 'completed' ? current.completedAt : now) : null;
  const updated = decisionActionSchema.parse({ ...current, ...changes, updatedAt: now, completedAt });
  await context.repository.updateDecisionRecord(hotelId, actionId, JSON.stringify(updated), now);
  return updated;
}

export async function deleteAction(context: ToolContext, hotelId: string, actionId: string): Promise<void> {
  const { actions } = readRecords(await context.repository.listDecisionRecords(hotelId));
  if (!actions.some((action) => action.id === actionId)) throw new DecisionError(404, 'unknown_action', 'No action with this id');
  await context.repository.deleteDecisionRecord(hotelId, actionId);
}
