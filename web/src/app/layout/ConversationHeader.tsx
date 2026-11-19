import { formatPeriodLabel, type DateRange } from '@aurora/shared';
import { RUN_PHASE_LABELS, type RunPhase } from '../../features/conversation/run-phase';

interface ConversationHeaderProps {
  /** The conversation's title; null for a new chat. */
  title: string | null;
  runPhase: RunPhase;
  /** The period answers are about; null while the workspace is loading. */
  period: DateRange | null;
}

export function ConversationHeader({ title, runPhase, period }: ConversationHeaderProps) {
  return (
    <header className="conversation-header">
      <div className="conversation-header__title-group">
        <span className="conversation-header__title">{title ?? 'New chat'}</span>
        {period && <span className="conversation-header__period">{formatPeriodLabel(period)} · month to date</span>}
      </div>
      {/* The modifier class (run-status--streaming, ...) picks the dot colour. */}
      <div className={`run-status run-status--${runPhase}`} role="status">
        <span className="run-status__dot" aria-hidden="true" />
        <span>{RUN_PHASE_LABELS[runPhase]}</span>
      </div>
    </header>
  );
}
