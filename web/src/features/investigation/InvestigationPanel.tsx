import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { ArrowRightIcon, CloseIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import {
  actionsForSelection,
  summarizeSelection,
  type ActionOptions,
  type InvestigationAction,
  type InvestigationSelection,
} from './investigation-actions';

interface InvestigationPanelProps {
  selection: InvestigationSelection;
  options: ActionOptions;
  /** Where the figures come from, shown at the bottom ("Daily results, 1–17 Nov 2026"). */
  source: string;
  onAction: (action: InvestigationAction) => void;
  onClose: () => void;
  /** Inside the evidence panel the panel is compact; on narrow screens it becomes a bottom sheet. */
  placement?: 'inline' | 'sheet-on-mobile';
}

/**
 * What was selected (a night in a chart, a KPI) and what can be done with it.
 * The figures are data from the answer; the actions start an investigation in
 * the chat with the selection as structured context, or show the evidence.
 */
export function InvestigationPanel({ selection, options, source, onAction, onClose, placement = 'sheet-on-mobile' }: InvestigationPanelProps) {
  const summary = summarizeSelection(selection);
  const actions = actionsForSelection(selection, options);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  // A new selection is announced politely; focus stays on the chart, so arrow keys keep working.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [summary.title]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape') return;
    // Closes the panel only; the dialog around it stays open.
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  return (
    <section
      ref={panelRef}
      className={joinClassNames('investigation-panel', placement === 'sheet-on-mobile' && 'investigation-panel--sheet')}
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
    >
      <header className="investigation-panel__header">
        <span className="investigation-panel__titles">
          <span className="investigation-panel__eyebrow">{summary.eyebrow}</span>
          <h3 className="investigation-panel__title" id={titleId} aria-live="polite">
            {summary.title}
          </h3>
        </span>
        <button type="button" className="icon-button icon-button--borderless" aria-label="Clear the selection" onClick={onClose}>
          <CloseIcon size={11} />
        </button>
      </header>

      <dl className="investigation-panel__figures">
        {summary.figures.map((figure) => (
          <div key={figure.label} className="investigation-panel__figure">
            <dt>{figure.label}</dt>
            <dd>
              <span className="investigation-panel__value">{figure.value}</span>
              {figure.delta && <span className="investigation-panel__delta">{figure.delta}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {summary.note && <p className="investigation-panel__note">{summary.note}</p>}

      <div className="investigation-panel__actions">
        {actions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            className={index === 0 ? 'primary-button investigation-panel__action' : 'secondary-button investigation-panel__action'}
            onClick={() => onAction(action)}
          >
            {action.label}
            {index === 0 && <ArrowRightIcon />}
          </button>
        ))}
      </div>

      <p className="investigation-panel__source">
        <span aria-hidden="true">✓</span> {source}. Figures from your data; the explanation is written when you ask.
      </p>
    </section>
  );
}
