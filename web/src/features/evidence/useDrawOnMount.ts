import { useEffect, useState } from 'react';

/** Long enough for the browser to paint the empty bars first, short enough to feel immediate. */
const DRAW_DELAY_MS = 30;

/**
 * False on first render, true a moment later. Charts render their bars at
 * zero size first and then at full size, so the CSS transition grows them in.
 *
 * A timer is used instead of requestAnimationFrame: animation frames are paused
 * in background tabs, which would leave the bars flat until the tab is shown.
 */
export function useDrawOnMount(): boolean {
  const [isDrawn, setIsDrawn] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsDrawn(true), DRAW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return isDrawn;
}
