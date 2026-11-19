import { useEffect, useRef } from 'react';
import { ProvenanceCard } from '../evidence/ProvenanceCard';
import type { ProvenanceData } from '../../stream/run-reducer';

interface EvidenceDrawerProps {
  evidence: ProvenanceData;
  onClose: () => void;
}

/**
 * The evidence behind one figure of the Property Overview, in the same card
 * as an answer's "How was this calculated?". It slides in at the side (a sheet
 * from the bottom on a phone), takes no space until asked for, and closes with
 * Escape or the × without losing the page; focus returns to the button that
 * opened it.
 */
export function EvidenceDrawer({ evidence, onClose }: EvidenceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>('button')?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      opener?.focus();
    };
    // Opened once per figure: a new figure re-runs it through the key below.
  }, [onClose]);

  return (
    <aside ref={drawerRef} className="evidence-drawer" role="complementary" aria-label="Evidence">
      <ProvenanceCard provenance={evidence} onClose={onClose} />
    </aside>
  );
}
