import { CloseIcon } from '../../design-system/icons';
import type { ProvenanceData } from '../../stream/run-reducer';

interface ContextualInsightCardProps {
  provenance: ProvenanceData;
  onShowProvenance: () => void;
  onDismiss: () => void;
}

/**
 * Opens under the explanation when a figure, chip or KPI is selected: what the
 * number means, and a way to see how it was calculated. Step 7 adds
 * "Explore this insight", which opens the full chart.
 */
export function ContextualInsightCard({ provenance, onShowProvenance, onDismiss }: ContextualInsightCardProps) {
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
        <button type="button" className="secondary-button" onClick={onShowProvenance}>
          How was this calculated?
        </button>
      </div>
    </section>
  );
}
