import { formatPeriodLabel, type DateRange, type IsoDate } from '@aurora/shared';
import type { RunPhase } from '../../features/conversation/run-phase';
import type { RunState } from '../../stream/run-reducer';

interface ConversationHeaderProps {
  /** The conversation's title; null for a new chat. */
  title: string | null;
  runPhase: RunPhase;
  /** The nights the latest answer is about; null when it is not about a period (a greeting, the saved decisions). */
  answerPeriod: DateRange | null;
  /** The demo's today (the data is generated around a fixed date). */
  today: IsoDate | null;
}

/**
 * The nights an answer is about: what it analysed or queried (its context), or for a
 * what-if the stay dates of its pace chart. Only for a finished answer.
 */
export function periodOfAnswer(run: RunState | undefined): DateRange | null {
  if (!run || run.phase !== 'done') return null;
  if (run.completion?.context) return run.completion.context.period;
  const pace = run.charts.booking_pace?.kind === 'booking_pace' ? run.charts.booking_pace.data : null;
  return pace ? { from: pace.stayFrom, to: pace.stayTo } : null;
}

/**
 * The chat's title, the nights the latest answer is about, and the demo's date,
 * so "today" in the answers is never mistaken for the real date. While Aurora
 * works, a status says so; once the answer is there, the answer speaks for itself.
 */
export function ConversationHeader({ title, runPhase, answerPeriod, today }: ConversationHeaderProps) {
  return (
    <header className="conversation-header">
      <div className="conversation-header__title-group">
        <span className="conversation-header__title">{title ?? 'New chat'}</span>
        {answerPeriod && (
          <span className="conversation-header__period" title="The nights the latest answer is about">
            {formatPeriodLabel(answerPeriod)}
          </span>
        )}
        {today && (
          <span className="conversation-header__demo-date" title="The demo's data is generated around this date">
            Demo data · today is {formatPeriodLabel({ from: today, to: today })}
          </span>
        )}
      </div>
      {/* Always in the page, so screen readers announce it when it changes; it only shows while Aurora works. */}
      <div className="run-status run-status--streaming" role="status">
        {runPhase === 'streaming' && (
          <>
            <span className="run-status__dot" aria-hidden="true" />
            <span>Aurora is analysing…</span>
          </>
        )}
      </div>
    </header>
  );
}
