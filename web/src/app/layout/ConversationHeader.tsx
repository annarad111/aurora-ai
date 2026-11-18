import { RUN_PHASE_LABELS, type RunPhase } from '../../features/conversation/run-phase';
import { REPORTING_PERIOD_LABEL } from '../workspace-content';

interface ConversationHeaderProps {
  runPhase: RunPhase;
}

export function ConversationHeader({ runPhase }: ConversationHeaderProps) {
  return (
    <header className="conversation-header">
      <div className="conversation-header__title-group">
        <span className="conversation-header__title">Revenue workspace</span>
        <span className="conversation-header__period">{REPORTING_PERIOD_LABEL}</span>
      </div>
      {/* The modifier class (run-status--streaming, ...) picks the dot colour. */}
      <div className={`run-status run-status--${runPhase}`} role="status">
        <span className="run-status__dot" aria-hidden="true" />
        <span>{RUN_PHASE_LABELS[runPhase]}</span>
      </div>
    </header>
  );
}
