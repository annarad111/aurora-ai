import { ArrowRightIcon, CloseIcon } from '../../design-system/icons';
import type { ProvenanceData } from '../../stream/run-reducer';

interface ContextualInsightCardProps {
  provenance: ProvenanceData;
  /** Absent when the chart behind this figure is not part of the answer (then the button is hidden). */
  onExplore: (() => void) | null;
  onShowProvenance: () => void;
  onDismiss: () => void;
}

/**
 * Opens under the explanation when a figure, chip or KPI is selected: what the
 * number means, a way into the full chart, and how it was calculated.
 */
export function ContextualInsightCard({ provenance, onExplore, onShowProvenance, onDismiss }: ContextualInsightCardProps) {
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
