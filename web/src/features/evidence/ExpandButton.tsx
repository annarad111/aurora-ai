import { ExpandIcon } from '../../design-system/icons';

/** The small "Expand" button in the corner of an evidence card. Opens the card's Explore view. */
export function ExpandButton({ chartName, onExpand }: { chartName: string; onExpand: () => void }) {
  return (
    <button type="button" className="expand-button" aria-label={`Expand ${chartName}`} onClick={onExpand}>
      <ExpandIcon />
      Expand
    </button>
  );
}
