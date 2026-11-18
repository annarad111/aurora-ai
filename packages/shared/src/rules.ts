import type { GroupBlock, IsoDate } from './domain';

// ---------------------------------------------------------------------------
// Small business rules needed on both sides: the worker uses them to write
// the narrative, the web app to colour the charts. One definition, so the
// text and the chart always agree.
// ---------------------------------------------------------------------------

/** True when the night belongs to a cancelled group block (read from the `group_blocks` table). */
export function isNightInCancelledBlock(night: IsoDate, groupBlocks: readonly GroupBlock[]): GroupBlock | null {
  return groupBlocks.find((block) => block.status === 'cancelled' && night >= block.firstNight && night <= block.lastNight) ?? null;
}
