import { ExpandIcon } from '../../design-system/icons';

/** The small "Expand" button in the corner of an evidence card. Opens the card's Explore view. */
export function ExpandButton({ chartName, onExpand, label = 'Expand' }: { chartName: string; onExpand: () => void; label?: string }) {
  return (
    <button type="button" className="expand-button" aria-label={`${label} ${chartName}`} onClick={onExpand}>
      <ExpandIcon />
      {label}
    </button>
  );
}
