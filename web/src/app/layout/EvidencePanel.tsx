/**
 * Right-hand column. For now it only has the empty state.
 * Step 6 adds the revenue bridge, channel mix, pace and provenance cards.
 */
export function EvidencePanel() {
  return (
    <aside className="evidence-panel workspace__evidence-panel" aria-label="Evidence panel">
      <div className="evidence-panel__empty">
        <span className="evidence-panel__empty-title">Evidence panel</span>
        <span className="evidence-panel__empty-text">
          Charts appear here as Aurora works. Click any number to see where it comes from.
        </span>
      </div>
    </aside>
  );
}
