import { joinClassNames } from '../../lib/class-names';
import type { ExplanationSegment } from '../../stream/run-reducer';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';

interface StreamedExplanationProps {
  segments: ExplanationSegment[];
  isStreaming: boolean;
  interaction: FactInteraction;
}

/**
 * The written explanation. It grows word by word while streaming. Every
 * figure is a button linked to the fact behind it.
 */
export function StreamedExplanation({ segments, isStreaming, interaction }: StreamedExplanationProps) {
  return (
    <div className="explanation" aria-live="polite" aria-busy={isStreaming}>
      {segments.map((segment, segmentIndex) =>
        segment.factId ? (
          <FigureButton key={segmentIndex} factId={segment.factId} label={segment.text} interaction={interaction} />
        ) : (
          <span key={segmentIndex}>{segment.text}</span>
        ),
      )}
      {isStreaming && <span className="explanation__caret" aria-hidden="true" />}
    </div>
  );
}

function FigureButton({ factId, label, interaction }: { factId: string; label: string; interaction: FactInteraction }) {
  return (
    <button
      type="button"
      className={joinClassNames('figure-link', isFactHighlighted(factId, interaction.activeFactId) && 'figure-link--active')}
      aria-pressed={interaction.focusedFactId === factId}
      onClick={() => interaction.focusFact(factId)}
      onMouseEnter={() => interaction.hoverFact(factId)}
      onMouseLeave={() => interaction.hoverFact(null)}
      onFocus={() => interaction.hoverFact(factId)}
      onBlur={() => interaction.hoverFact(null)}
    >
      {label}
    </button>
  );
}
