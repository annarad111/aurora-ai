import type { NewSavedInsight, SavedInsight } from '@aurora/shared';
import { useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import type { DecisionsStore } from './useDecisions';

interface SaveInsightButtonProps {
  /** What would be saved; null when there is nothing to save yet. */
  insight: NewSavedInsight | null;
  store: DecisionsStore;
  /** Smaller, for the dark briefing cards and the main finding. */
  compact?: boolean;
}

/**
 * Save / Saved toggle. Saving the same insight twice keeps one record, and
 * an insight with actions cannot be removed (the server says so, and the
 * message is shown here).
 */
export function SaveInsightButton({ insight, store, compact = false }: SaveInsightButtonProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!insight || store.state.status !== 'ready') return null;
  const saved: SavedInsight | undefined = store.savedBySourceKey.get(insight.sourceKey);

  async function toggle() {
    if (!insight) return;
    setIsBusy(true);
    setMessage(null);
    const result = saved ? await store.removeInsight(saved.id) : await store.saveInsight(insight);
    setIsBusy(false);
    setMessage(result.ok ? (saved ? 'Removed from Decisions' : 'Saved to Decisions') : result.message);
  }

  return (
    <span className="save-insight">
      <button
        type="button"
        className={joinClassNames('save-insight__button', compact && 'save-insight__button--compact', saved && 'save-insight__button--saved')}
        aria-pressed={Boolean(saved)}
        disabled={isBusy}
        onClick={() => void toggle()}
      >
        <BookmarkIcon filled={Boolean(saved)} />
        {isBusy ? (saved ? 'Removing…' : 'Saving…') : saved ? 'Saved' : 'Save insight'}
      </button>
      <span className="save-insight__message" role="status">
        {message}
      </span>
    </span>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2h8v12l-4-3-4 3z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
