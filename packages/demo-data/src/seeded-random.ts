/**
 * Deterministic pseudo-random numbers (the mulberry32 algorithm).
 * The same seed always gives the same sequence, so the demo data is identical
 * on every machine and every run.
 */
export interface SeededRandom {
  /** A number in [0, 1). */
  next(): number;
  /** A number in [min, max). */
  between(min: number, max: number): number;
  /** A multiplier around 1: jitter(0.05) is somewhere in [0.95, 1.05). */
  jitter(spread: number): number;
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed | 0;

  function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    between: (min, max) => min + next() * (max - min),
    jitter: (spread) => 1 - spread + next() * 2 * spread,
  };
}
