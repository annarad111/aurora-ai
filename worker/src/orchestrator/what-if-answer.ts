import { formatCount, formatEuro, formatPercent, type DateRange, type IsoDate, type ScenarioLevers, type SimulateScenarioOutput, type TrailStage } from '@aurora/shared';
import { paceWindowFor } from './analysis-context';
import { describeNights } from './derived-facts';
import { parsePeriod } from './question-parser';

// ---------------------------------------------------------------------------
// What-if questions in the chat ("what if we win back half the gap?", "what
// if we raise the rate by 5%?", "what if 20% of OTA bookings came direct?"),
// answered by the same deterministic simulate_scenario as the simulator. The
// answer says it is a calculation on the bookings on the books, not a
// forecast, and opens the simulator to try other levers.
// ---------------------------------------------------------------------------

export interface WhatIfFocus {
  levers: ScenarioLevers;
  /** Future stay dates (default: the pace window). */
  window?: DateRange;
  /** No lever was named: the answer uses "win back half the gap" as an example. */
  isExample: boolean;
}

const IS_WHAT_IF =
  /\b(what[- ]if|simulat\w*|scenarios?|what would (it|that) (be worth|bring|mean|add)|how much would (we|it) (gain|make|earn|add)|if we (win|won|recover|raise|increase|lower|cut|reduce|move|shift|get|convert))\b/i;

const SHARE_WORDS: Record<string, number> = { all: 1, everything: 1, half: 0.5, 'a third': 1 / 3, 'a quarter': 0.25, 'three quarters': 0.75 };

function readShare(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const percent = /(\d{1,3}(?:\.\d+)?)\s?%/.exec(text);
  if (percent) return Math.min(1, Math.max(0, Number(percent[1]) / 100));
  const word = Object.keys(SHARE_WORDS).find((candidate) => text.toLowerCase().includes(candidate));
  return word ? SHARE_WORDS[word] : undefined;
}

const SHARE = '(half|all|everything|a third|a quarter|three quarters|\\d{1,3}(?:\\.\\d+)?\\s?%)';

export function parseWhatIfQuestion(question: string, today: IsoDate): WhatIfFocus | null {
  if (!IS_WHAT_IF.test(question)) return null;

  const recovery = new RegExp(`\\b(?:win|won|get|bring|recover\\w*|fill)\\s+(?:back\\s+)?(?:${SHARE}(?:\\s+of)?(?:\\s+the)?(?:\\s+(?:gap|nights|room nights|pace gap|shortfall))?|back\\s+${SHARE})`, 'i').exec(question);
  const rateUp = /\b(?:raise|increase|lift|put up|up)\s+(?:the\s+|our\s+)?(?:rates?|prices?|adr)\s+(?:by\s+)?(\d{1,2}(?:\.\d+)?)\s?%/i.exec(question);
  const rateDown = /\b(?:lower|cut|reduce|drop|decrease|discount)\s+(?:the\s+|our\s+)?(?:rates?|prices?|adr)\s+(?:by\s+)?(\d{1,2}(?:\.\d+)?)\s?%/i.exec(question);
  const toDirect = new RegExp(`${SHARE}\\s+(?:of\\s+)?(?:the\\s+|our\\s+)?(?:ota|booking[- ]sites?|online travel agen\\w*)(?:\\s+(?:bookings?|guests?|revenue))?\\s+(?:came|come|went|go|moved?|shifted|switched?|to)\\s*(?:to\\s+)?direct`, 'i').exec(question)
    ?? new RegExp(`\\b(?:move|shift|switch|convert|bring)\\s+${SHARE}\\s+(?:of\\s+)?(?:the\\s+|our\\s+)?(?:ota|booking[- ]sites?)`, 'i').exec(question);

  const paceRecovery = readShare(recovery?.[1] ?? recovery?.[2]);
  const rateChange = rateUp ? Number(rateUp[1]) / 100 : rateDown ? -Number(rateDown[1]) / 100 : undefined;
  const otaToDirect = readShare(toDirect?.[1]);
  const named = paceRecovery !== undefined || rateChange !== undefined || otaToDirect !== undefined;

  const period = parsePeriod(question, today);
  const window = period && period.from > today ? period : undefined;
  return {
    levers: {
      paceRecovery: named ? (paceRecovery ?? 0) : 0.5,
      rateChange: Math.max(-0.3, Math.min(0.3, rateChange ?? 0)),
      otaToDirect: otaToDirect ?? 0,
    },
    ...(window ? { window } : {}),
    isExample: !named,
  };
}

/** The stay dates a what-if is about. */
export function whatIfWindow(focus: WhatIfFocus, today: IsoDate): DateRange {
  return focus.window ?? paceWindowFor(today);
}

/** Arguments the model chose for simulate_scenario, read leniently and clamped. */
export function whatIfFocusFromModel(rawArguments: Record<string, unknown>, today: IsoDate): WhatIfFocus {
  const number = (value: unknown, min: number, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined);
  const paceRecovery = number(rawArguments.paceRecovery, 0, 1);
  const rateChange = number(rawArguments.rateChange, -0.3, 0.3);
  const otaToDirect = number(rawArguments.otaToDirect, 0, 1);
  const named = Boolean(paceRecovery || rateChange || otaToDirect);
  const stayFrom = rawArguments.stayFrom;
  const stayTo = rawArguments.stayTo;
  const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const window = isDate(stayFrom) && isDate(stayTo) && stayFrom > today && stayFrom <= stayTo ? { from: stayFrom, to: stayTo } : undefined;
  return {
    levers: { paceRecovery: named ? (paceRecovery ?? 0) : 0.5, rateChange: rateChange ?? 0, otaToDirect: otaToDirect ?? 0 },
    ...(window ? { window } : {}),
    isExample: !named,
  };
}

// --- Writing the answer ----------------------------------------------------------------

function describeLevers(levers: ScenarioLevers, behind: number): string {
  const parts: string[] = [];
  if (levers.paceRecovery > 0) {
    parts.push(
      levers.paceRecovery === 1
        ? `you win back all ${formatCount(behind)} room nights you are behind last year`
        : `you win back ${formatPercent(levers.paceRecovery, { decimals: 0 })} of the ${formatCount(behind)} room nights you are behind last year`,
    );
  }
  if (levers.rateChange !== 0) {
    parts.push(`you sell the rooms still to sell ${formatPercent(Math.abs(levers.rateChange), { decimals: 0 })} ${levers.rateChange > 0 ? 'above' : 'below'} the rate on the books`);
  }
  if (levers.otaToDirect > 0) parts.push(`${formatPercent(levers.otaToDirect, { decimals: 0 })} of booking-site revenue comes direct instead`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? 'nothing changes');
}

function signedEuro(amount: number): string {
  return formatEuro(Math.round(amount), { signDisplay: 'always' });
}

export interface WhatIfAnswer {
  headline: string;
  text: string;
  trail: TrailStage[];
  followups: string[];
  contextText: string;
}

/**
 * `combined` is the same rate change with half the gap won back, used when the
 * question only changed the rate: a rate only applies to rooms still to sell.
 */
export function writeWhatIfAnswer(result: SimulateScenarioOutput, focus: WhatIfFocus, combined: SimulateScenarioOutput | null): WhatIfAnswer {
  const { outcome, levers, basis } = result;
  const nights = describeNights({ from: basis.stayFrom, to: basis.stayTo });
  const behind = outcome.roomNightsBehindLastYear;
  const net = outcome.effects.netChange;
  const scenarioWords = describeLevers(levers, behind);

  const sentences: string[] = [];
  if (focus.isExample) sentences.push(`An example for ${nights}: what if ${scenarioWords}?`);
  else sentences.push(`The scenario for ${nights}: ${scenarioWords}.`);

  if (outcome.recoveredRoomNights > 0) {
    sentences.push(
      `The hotel would sell ${formatCount(outcome.recoveredRoomNights)} more room nights at ${formatEuro(Math.round(outcome.rateForNewBookings))}, and room revenue would go from ${formatEuro(Math.round(outcome.baseline.roomRevenue))} to ${formatEuro(Math.round(outcome.scenario.roomRevenue))}${
        outcome.effects.commissionOnNewRevenue !== 0 ? `, of which ${formatEuro(Math.round(Math.abs(outcome.effects.commissionOnNewRevenue)))} would go to commission` : ''
      }.`,
    );
  }
  if (outcome.effects.commissionSavedByDirect > 0) {
    sentences.push(`Booking direct instead of through booking sites would save ${formatEuro(Math.round(outcome.effects.commissionSavedByDirect))} of commission.`);
  }
  if (outcome.limitedByCapacity) sentences.push('The hotel would be full before the whole recovery fits, so it is capped at the rooms that can be sold.');

  const onlyRate = levers.rateChange !== 0 && levers.paceRecovery === 0 && levers.otaToDirect === 0;
  if (onlyRate) {
    sentences.push('A new rate only applies to the rooms still to sell; with no extra room nights won back, net revenue stays the same.');
    if (combined) {
      sentences.push(
        `Together with winning back half the gap, it would be worth ${signedEuro(combined.outcome.effects.netChange)} in net revenue (${formatCount(combined.outcome.recoveredRoomNights)} room nights at ${formatEuro(Math.round(combined.outcome.rateForNewBookings))}).`,
      );
    }
  } else {
    sentences.push(`Net revenue after commission: ${signedEuro(net)} (${formatEuro(Math.round(outcome.baseline.netRevenue))} → ${formatEuro(Math.round(outcome.scenario.netRevenue))}).`);
  }
  sentences.push('This is a calculation on the bookings on the books, not a forecast. Open the simulator to try other levers.');
  const text = sentences.join(' ');

  const onlyRecovery = levers.paceRecovery > 0 && levers.rateChange === 0 && levers.otaToDirect === 0;
  const onlyDirect = levers.otaToDirect > 0 && levers.rateChange === 0 && levers.paceRecovery === 0;
  const subject = onlyRecovery
    ? `Winning back ${levers.paceRecovery === 0.5 ? 'half' : formatPercent(levers.paceRecovery, { decimals: 0 })} of the gap`
    : onlyDirect
      ? `Moving ${formatPercent(levers.otaToDirect, { decimals: 0 })} of booking-site revenue to direct`
      : 'This scenario';
  const headline = onlyRate
    ? `A ${formatPercent(Math.abs(levers.rateChange), { decimals: 0 })} rate change alone does not change net revenue for ${nights}.`
    : `${subject} would be worth ${signedEuro(net)} in net revenue for ${nights}.`;

  const trail: TrailStage[] = [
    { stage: 'observation', text: `${formatCount(basis.roomsOnTheBooks)} room nights are on the books for ${nights}, ${formatCount(behind)} behind last year.`, factId: 'what_if' },
    { stage: 'discovery', text: `The scenario: ${scenarioWords}.` },
    {
      stage: 'understanding',
      text: onlyRate
        ? 'A rate only changes revenue on rooms still to sell.'
        : `Net revenue after commission changes by ${signedEuro(net)}.`,
    },
    {
      stage: 'decision',
      text: 'Move the levers yourself: pace recovery, rate and direct bookings.',
      action: { kind: 'explore', label: 'Open the what-if simulator', view: 'pace' },
    },
  ];

  const followups = [
    levers.otaToDirect === 0 ? `What if 20% of OTA bookings came direct for ${nights}?` : `What if we win back half the gap for ${nights}?`,
    levers.rateChange === 0 ? `What if we win back half the gap and raise the rate by 5%?` : 'Are we on pace for the rest of the month?',
  ];

  return { headline, text, trail, followups, contextText: text };
}
