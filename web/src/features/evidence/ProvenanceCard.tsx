import { CloseIcon } from '../../design-system/icons';
import type { ProvenanceData } from '../../stream/run-reducer';

interface ProvenanceCardProps {
  provenance: ProvenanceData;
  onClose: () => void;
}

/** "How was this calculated?": tool, formula, inputs and source of one figure. */
export function ProvenanceCard({ provenance, onClose }: ProvenanceCardProps) {
  return (
    <section className="evidence-card provenance-card" aria-label="How was this calculated?">
      <header className="provenance-card__header">
        <div className="provenance-card__titles">
          <span className="provenance-card__eyebrow">How was this calculated?</span>
          <span className="provenance-card__title">{provenance.title}</span>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <span className="provenance-card__value">{provenance.displayValue}</span>

      <div className="provenance-card__field">
        <span className="provenance-card__field-label">Tool</span>
        <span className="provenance-card__tool">{provenance.tool}</span>
      </div>

      <div className="provenance-card__field">
        <span className="provenance-card__field-label">Formula</span>
        <code className="provenance-card__formula">{provenance.formula}</code>
      </div>

      <div className="provenance-card__field">
        <span className="provenance-card__field-label">Inputs</span>
        <dl className="provenance-card__inputs">
          {provenance.inputs.map((input) => (
            <div key={input.label} className="provenance-card__input-row">
              <dt>{input.label}</dt>
              <dd>{input.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="provenance-card__field">
        <span className="provenance-card__field-label">Source</span>
        <code className="provenance-card__source">{provenance.sourceQuery}</code>
      </div>

      <p className="provenance-card__footnote">
        Computed deterministically in packages/analytics. The language model only writes the sentence around it.
      </p>
    </section>
  );
}
