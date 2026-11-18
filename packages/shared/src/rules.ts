// ---------------------------------------------------------------------------
// Small business rules needed on both sides: the worker uses them to write
// the narrative, the web app to colour the charts. One definition, so the
// text and the chart always agree.
// ---------------------------------------------------------------------------

/** A night counts as a cancelled group block when at least a quarter of the hotel was cancelled for it. */
export const CANCELLED_BLOCK_SHARE_OF_ROOMS = 0.25;

export function isCancelledBlockNight(night: { roomsCancelled: number }, roomCount: number): boolean {
  return night.roomsCancelled >= roomCount * CANCELLED_BLOCK_SHARE_OF_ROOMS;
}
