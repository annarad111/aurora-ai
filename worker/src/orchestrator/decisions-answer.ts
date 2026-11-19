import {
  ACTION_STATUS_LABELS,
  formatPercent,
  type ActionPriority,
  type ActionStatus,
  type DecisionActionDigest,
  type GetDecisionsInput,
  type GetDecisionsOutput,
  type TrailStage,
} from '@aurora/shared';
import { describeDate } from './derived-facts';

// ---------------------------------------------------------------------------
// Questions about the Decisions workspace ("what decisions are saved?",
// "which actions are high priority?", "what is overdue?"), answered from
// get_decisions. The answer is written by fixed rules from the records, so
// every title, owner, date and status is exactly what the user saved.
// ---------------------------------------------------------------------------

/** What the question asks for, beyond "everything". */
export interface DecisionsFocus {
  statuses?: ActionStatus[];
  priorities?: ActionPriority[];
  /** Due dates: past (overdue), or within the next 7 days. */
  due?: 'overdue' | 'this_week';
}

const ABOUT_DECISIONS = [
  /\b(decisions?|saved insights?|action items?|to-?dos?|to do list|tasks?|overdue|backlog)\b/i,
  /\b(my|our|open|saved|pending|planned|completed|done|finished|dismissed|urgent|recorded|assigned|high[- ]priority|medium[- ]priority|low[- ]priority|in[- ]progress)\s+(actions?|insights?)\b/i,
  /\bactions?\b.*\b(saved|decided|recorded|assigned|due|owner|priority|priorities|status|completed|done|finished|dismissed|open|pending|in[- ]progress|overdue|urgent)\b/i,
  /\b(what|which)\b.*\b(marked|set)\b.*\bpriority\b/i,
  /\bwho (owns|is responsible|is assigned)\b/i,
  /\bwhat (did|have) (i|we) (save|saved|decide|decided)\b/i,
];

/** "What should we do about pace?" asks for advice, not for the saved list. */
const ASKS_FOR_ADVICE = /\b(should|could) (i|we)\b/i;
const MENTIONS_SAVED = /\b(saved|recorded|my|our|decisions? tab|workspace)\b/i;

export function parseDecisionsQuestion(question: string): DecisionsFocus | null {
  if (!ABOUT_DECISIONS.some((pattern) => pattern.test(question))) return null;
  if (ASKS_FOR_ADVICE.test(question) && !MENTIONS_SAVED.test(question)) return null;

  const focus: DecisionsFocus = {};
  const statuses: ActionStatus[] = [];
  if (/\bin[- ]progress\b/i.test(question)) statuses.push('in_progress');
  if (/\b(open|pending|to-?do|not (yet )?started|still to do|outstanding)\b/i.test(question)) statuses.push('todo', 'in_progress');
  if (/\b(completed|done|finished)\b/i.test(question)) statuses.push('completed');
  if (/\bdismissed\b/i.test(question)) statuses.push('dismissed');
  if (statuses.length > 0) focus.statuses = [...new Set(statuses)];

  const priorities: ActionPriority[] = [];
  if (/\b(high(est)?[- ]priority|urgent|most important|critical)\b/i.test(question)) priorities.push('high');
  if (/\bmedium[- ]priority\b/i.test(question)) priorities.push('medium');
  if (/\blow[- ]priority\b/i.test(question)) priorities.push('low');
  if (priorities.length > 0) focus.priorities = priorities;

  if (/\b(overdue|late|past due|behind schedule)\b/i.test(question)) focus.due = 'overdue';
  else if (/\b(due (this|next) week|due soon|coming up|upcoming)\b/i.test(question)) focus.due = 'this_week';
  return focus;
}

/** The focus as tool input (due dates are filtered here, the tool only knows status and priority). */
export function toolInputFor(hotelId: string, focus: DecisionsFocus): GetDecisionsInput {
  return {
    hotelId,
    ...(focus.statuses ? { statuses: focus.statuses } : {}),
    ...(focus.priorities ? { priorities: focus.priorities } : {}),
  };
}

/** Arguments a language model chose for get_decisions, read leniently. */
export function focusFromModelArguments(rawArguments: Record<string, unknown>): DecisionsFocus {
  const pick = <Value extends string>(value: unknown, allowed: readonly Value[]): Value[] | undefined => {
    const values = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter((item): item is Value =>
      allowed.includes(item as Value),
    );
    return values.length > 0 ? values : undefined;
  };
  const statuses = pick(rawArguments.statuses, ['todo', 'in_progress', 'completed', 'dismissed'] as const);
  const priorities = pick(rawArguments.priorities, ['high', 'medium', 'low'] as const);
  return { ...(statuses ? { statuses } : {}), ...(priorities ? { priorities } : {}) };
}

// --- Writing the answer ----------------------------------------------------------------

const MAXIMUM_LISTED_ACTIONS = 5;
const PRIORITY_WORDS: Record<ActionPriority, string> = { high: 'high priority', medium: 'medium priority', low: 'low priority' };

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A title in quotes, without its own closing full stop (the sentence adds one). */
function quote(title: string): string {
  return `“${title.trim().replace(/[.!]+$/, '')}”`;
}

function isOpen(action: DecisionActionDigest): boolean {
  return action.status === 'todo' || action.status === 'in_progress';
}

/** "Review direct-booking offers (high priority, in progress, owner: Revenue manager, due 20 November, overdue)". */
function describeAction(action: DecisionActionDigest): string {
  const details = [PRIORITY_WORDS[action.priority], ACTION_STATUS_LABELS[action.status].toLowerCase()];
  if (action.owner) details.push(`owner: ${action.owner}`);
  if (action.dueDate) details.push(`due ${describeDate(action.dueDate)}`);
  if (action.isOverdue) details.push('overdue');
  return `${quote(action.title)} (${details.join(', ')})`;
}

function describeOutcome(action: DecisionActionDigest): string {
  const outcome = action.outcome;
  if (!outcome) return '';
  if (outcome.status === 'not_measurable') return ' Its outcome is not yet measurable.';
  const format = (value: number) =>
    outcome.unit === 'ratio' ? formatPercent(value, { decimals: 1 }) : outcome.unit === 'currency' ? `€${Math.round(value).toLocaleString('en-GB')}` : Math.round(value).toLocaleString('en-GB');
  return ` Since then, ${outcome.label.toLowerCase()} went from ${format(outcome.before)} to ${format(outcome.after)}; the data does not show whether the action caused it.`;
}

function describeFilter(focus: DecisionsFocus): string {
  const parts: string[] = [];
  if (focus.priorities) parts.push(focus.priorities.map((priority) => PRIORITY_WORDS[priority]).join(' or '));
  if (focus.statuses) {
    const isOpenOnly = focus.statuses.length === 2 && focus.statuses.includes('todo') && focus.statuses.includes('in_progress');
    parts.push(isOpenOnly ? 'open' : focus.statuses.map((status) => ACTION_STATUS_LABELS[status].toLowerCase()).join(' or '));
  }
  if (focus.due === 'overdue') parts.push('overdue');
  if (focus.due === 'this_week') parts.push('due in the next 7 days');
  return parts.join(', ');
}

export interface DecisionsAnswer {
  headline: string;
  text: string;
  trail: TrailStage[];
  followups: string[];
  /** For "How was this calculated?". */
  contextText: string;
}

export function writeDecisionsAnswer(output: GetDecisionsOutput, focus: DecisionsFocus): DecisionsAnswer {
  const { counts } = output;
  const openCount = counts.todo + counts.inProgress;
  const totalActions = openCount + counts.completed + counts.dismissed;
  const openDecisions: TrailStage = { stage: 'decision', text: 'Update statuses, add an owner or a due date, or create a new action in Decisions.', action: { kind: 'navigate', label: 'Open Decisions', destination: 'decisions' } };
  const unreadableNote = output.unreadableRecordCount > 0 ? ` ${plural(output.unreadableRecordCount, 'saved record')} could not be read and ${output.unreadableRecordCount === 1 ? 'is' : 'are'} left out.` : '';

  if (counts.savedInsights === 0) {
    return {
      headline: 'Nothing is saved in Decisions yet.',
      text: `There are no saved insights or actions for this hotel yet. Save an insight from the morning briefing or from an answer, then create an action for it in Decisions.${unreadableNote}`,
      trail: [{ stage: 'observation', text: 'Decisions is empty: no saved insights, no actions.' }, { ...openDecisions, text: 'Save an insight from the briefing or an answer to start.' }],
      followups: ['Why is revenue below target this month?', 'Are we on pace for the rest of the month?'],
      contextText: 'Decisions has no saved insights or actions for this hotel.',
    };
  }

  // Due-date focus is applied here; status and priority were applied by the tool.
  const weekEnd = addDays(output.today, 7);
  const selected = output.actions.filter((action) => {
    if (focus.due === 'overdue') return action.isOverdue;
    if (focus.due === 'this_week') return isOpen(action) && action.dueDate !== null && action.dueDate >= output.today && action.dueDate <= weekEnd;
    return true;
  });
  const isFocused = output.isFiltered || focus.due !== undefined;
  const filterWords = describeFilter(focus);
  const listed = selected.slice(0, MAXIMUM_LISTED_ACTIONS);
  const moreCount = selected.length - listed.length;
  const listSentence = listed.map((action, index) => `${index + 1}. ${describeAction(action)}.${action.status === 'completed' ? describeOutcome(action) : ''}`).join(' ');
  const moreSentence = moreCount > 0 ? ` And ${plural(moreCount, 'more action')} in Decisions.` : '';

  const insightTitles = output.insights.slice(-3).reverse().map((insight) => quote(insight.title));
  const insightsSentence = `${plural(counts.savedInsights, 'saved insight')}${counts.savedInsights > 3 ? ', the latest' : ''}: ${insightTitles.join('; ')}.`;
  // Only the statuses that occur: "3 actions: 2 to do and 1 completed; 1 overdue."
  const statusParts = [
    counts.todo > 0 ? `${counts.todo} to do` : null,
    counts.inProgress > 0 ? `${counts.inProgress} in progress` : null,
    counts.completed > 0 ? `${counts.completed} completed` : null,
    counts.dismissed > 0 ? `${counts.dismissed} dismissed` : null,
  ].filter((part): part is string => part !== null);
  const statusWords = statusParts.length > 1 ? `${statusParts.slice(0, -1).join(', ')} and ${statusParts.at(-1)}` : (statusParts[0] ?? '');
  const countsSentence =
    totalActions === 0
      ? 'No actions have been created for them yet.'
      : totalActions === 1
        ? `1 action, ${statusWords.replace(/^1 /, '')}${counts.overdue > 0 ? ' and overdue' : ''}.`
        : `${plural(totalActions, 'action')}: ${statusWords}${counts.overdue > 0 ? `; ${counts.overdue} overdue` : ''}.`;

  let headline: string;
  let text: string;
  if (isFocused) {
    headline = selected.length === 0 ? `No ${filterWords} actions in Decisions.` : `${plural(selected.length, `${filterWords} action`)} in Decisions.`;
    text = selected.length === 0 ? `None of the ${plural(totalActions, 'action')} in Decisions is ${filterWords}. ${countsSentence}` : `${listSentence}${moreSentence}`;
  } else {
    const topOpen = output.actions.find(isOpen);
    headline =
      openCount === 0
        ? totalActions === 0
          ? `${plural(counts.savedInsights, 'saved insight')}, no actions yet.`
          : totalActions === 1
          ? `The only action is ${output.actions[0]?.status === 'dismissed' ? 'dismissed' : 'completed'}.`
          : `All ${plural(totalActions, 'action')} are completed or dismissed.`
        : `${plural(openCount, 'open action')}${topOpen ? `; first: ${quote(topOpen.title)}` : ''}.`;
    const listIntro = openCount > 0 ? ' Open actions, most important first: ' : totalActions > 0 ? ' Most recent: ' : '';
    text = `${insightsSentence} ${countsSentence}${listed.length > 0 ? `${listIntro}${listSentence}${moreSentence}` : ''}`;
  }
  text += unreadableNote;

  // --- The trail ---
  const trail: TrailStage[] = [
    { stage: 'observation', text: `${plural(counts.savedInsights, 'saved insight')} and ${plural(totalActions, 'action')} in Decisions.`, factId: 'decisions' },
  ];
  const firstOpen = output.actions.find(isOpen);
  const overdue = output.actions.filter((action) => action.isOverdue);
  if (overdue.length > 0) {
    trail.push({ stage: 'discovery', text: `${plural(overdue.length, 'action is', 'actions are')} overdue, starting with ${quote(overdue[0]!.title)}.` });
  } else if (firstOpen) {
    trail.push({ stage: 'discovery', text: `First in line: ${quote(firstOpen.title)} (${PRIORITY_WORDS[firstOpen.priority]}${firstOpen.dueDate ? `, due ${describeDate(firstOpen.dueDate)}` : ''}).` });
  }
  const completed = output.actions.filter((action) => action.status === 'completed');
  const measured = completed.filter((action) => action.outcome?.status === 'observed');
  trail.push({
    stage: 'understanding',
    text:
      completed.length === 0
        ? 'Nothing is completed yet, so there is no outcome to look at.'
        : measured.length === 0
          ? `${plural(completed.length, 'action is', 'actions are')} completed; the outcome is not yet measurable.`
          : `${plural(measured.length, 'completed action has', 'completed actions have')} an observed change in the data; whether the action caused it is not known.`,
  });
  trail.push(openDecisions);

  // --- Follow-ups: other views of the list, then the question behind the top insight ---
  const candidates = ['Which actions are high priority?', 'Which actions are overdue?', 'Which actions are completed?', 'Which actions are due this week?'];
  const askedAlready = (question: string) => {
    const parsed = parseDecisionsQuestion(question);
    return JSON.stringify(parsed) === JSON.stringify(focus);
  };
  const behindTopInsight = output.insights.at(-1)?.investigation?.question;
  const followups = [...candidates.filter((question) => !askedAlready(question)).slice(0, 2), ...(behindTopInsight ? [behindTopInsight] : [])].slice(0, 3);

  return {
    headline,
    text,
    trail,
    followups,
    contextText: `${insightsSentence} ${countsSentence}`,
  };
}
