/**
 * Waits `milliseconds`, but returns at once when the run is aborted,
 * so Stop never has to wait for a pause to end.
 */
export function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
  });
}
