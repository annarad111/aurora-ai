import { useEffect, useState } from 'react';

/**
 * False on the first frame, true right after. Charts render their bars at zero
 * height first and then at full height, so the CSS transition grows them in.
 */
export function useDrawOnMount(): boolean {
  const [isDrawn, setIsDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return isDrawn;
}
