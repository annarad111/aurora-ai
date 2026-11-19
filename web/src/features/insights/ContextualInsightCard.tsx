import { ArrowRightIcon, CloseIcon } from '../../design-system/icons';
import type { ProvenanceData } from '../../stream/run-reducer';
import type { InvestigationAction } from '../investigation/investigation-actions';

interface ContextualInsightCardProps {
  provenance: ProvenanceData;
  /** Absent when the chart behind this figure is not part of the answer (then the button is hidden). */
  onExplore: (() => void) | null;
  onShowProvenance: () => void;
  onDismiss: () => void;
  /** For a KPI: questions to investigate it further, each with the KPI as structured context. */
  investigationActions?: InvestigationAction[];
  onAction?: (action: InvestigationAction) => void;
}

/**
 * Opens under the explanation when a figure, chip or KPI is selected: what the
 * number means, a way into the full chart, and how it was calculated.
 */
export function ContextualInsightCard({
  provenance,
  onExplore,
  onShowProvenance,
  onDismiss,
  investigationActions = [],
  onAction,
}: ContextualInsightCardProps) {
  // "How was this calculated?" is already here, so the evidence action is not repeated.
  const questions = investigationActions.filter((action) => action.kind === 'ask');
  return (
    <section className="contextual-insight" aria-label="Contextual insight">
      <header className="contextual-insight__header">
        <span className="contextual-insight__titles">
          <span className="contextual-insight__eyebrow">Contextual insight</span>
          <span className="contextual-insight__label">{provenance.contextLabel}</span>
        </span>
        <button type="button" className="icon-button icon-button--borderless" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon size={11} />
        </button>
      </header>

      <p className="contextual-insight__text">{provenance.contextText}</p>

      {questions.length > 0 && onAction && (
        <div className="contextual-insight__investigate" role="group" aria-label="Investigate this figure">
          <span className="contextual-insight__investigate-label">Investigate</span>
          {questions.map((action) => (
            <button key={action.id} type="button" className="follow-up" onClick={() => onAction(action)}>
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="contextual-insight__actions">
        {onExplore && (
          <button type="button" className="primary-button" onClick={onExplore}>
            Explore this insight
            <ArrowRightIcon />
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onShowProvenance}>
          How was this calculated?
        </button>
      </div>
    </section>
  );
}
