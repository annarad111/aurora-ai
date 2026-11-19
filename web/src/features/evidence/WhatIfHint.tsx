import { useId, useState, type KeyboardEvent } from 'react';
import { CloseIcon } from '../../design-system/icons';

const HINT_STORAGE_KEY = 'aurora.hint.what-if-seen';

function hasSeenHint(): boolean {
  try {
    return window.localStorage.getItem(HINT_STORAGE_KEY) === 'yes';
  } catch {
    // Storage blocked: show the hint, it can still be closed for this visit.
    return false;
  }
}

function rememberHintSeen(): void {
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, 'yes');
  } catch {
    // Not being able to remember it is harmless.
  }
}

interface WhatIfHintProps {
  onOpenSimulator: () => void;
}

/**
 * A one-time pop-up on the pace card: the simulator is behind "Expand", and
 * Aurora answers what-if questions in the chat. Shown until closed once, then
 * remembered in this browser. It does not take focus, so it never interrupts.
 */
export function WhatIfHint({ onOpenSimulator }: WhatIfHintProps) {
  const [isVisible, setIsVisible] = useState(() => typeof window !== 'undefined' && !hasSeenHint());
  const titleId = useId();
  if (!isVisible) return null;

  function close() {
    rememberHintSeen();
    setIsVisible(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  return (
    <div className="what-if-hint" role="region" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <div className="what-if-hint__top">
        <span className="what-if-hint__badge">New</span>
        <span id={titleId} className="what-if-hint__title">
          Try a what-if
        </span>
        <button type="button" className="icon-button icon-button--borderless what-if-hint__close" aria-label="Close the tip" onClick={close}>
          <CloseIcon size={10} />
        </button>
      </div>
      <p className="what-if-hint__text">
        Expand this card to see what winning nights back, a rate change or more direct bookings would be worth. You can also ask Aurora in the chat,
        for example “What if we win back half the gap?”.
      </p>
      <div className="what-if-hint__buttons">
        <button
          type="button"
          className="what-if-hint__primary"
          onClick={() => {
            close();
            onOpenSimulator();
          }}
        >
          Open the simulator
        </button>
        <button type="button" className="text-button" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
}
