import { isoDateSchema, type IsoDate } from '@aurora/shared';

/** Bindings and variables configured in wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DEMO_TODAY?: string;
  STREAM_STEP_DELAY_MS?: string;
  TEXT_TOKEN_DELAY_MS?: string;
}

export interface WorkerConfig {
  /** The date the hotel treats as today. */
  today: IsoDate;
  /** Pause between the run's steps, in milliseconds. */
  stepDelayMs: number;
  /** Pause between streamed words, in milliseconds. */
  textTokenDelayMs: number;
}

const DEFAULT_TODAY: IsoDate = '2026-11-17';

function readNonNegativeInteger(rawValue: string | undefined, fallback: number): number {
  const parsedValue = Number(rawValue);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

/** Reads and checks the plain-text variables, with safe defaults. */
export function readWorkerConfig(env: Pick<Env, 'DEMO_TODAY' | 'STREAM_STEP_DELAY_MS' | 'TEXT_TOKEN_DELAY_MS'>): WorkerConfig {
  const parsedToday = isoDateSchema.safeParse(env.DEMO_TODAY);
  return {
    today: parsedToday.success ? parsedToday.data : DEFAULT_TODAY,
    stepDelayMs: readNonNegativeInteger(env.STREAM_STEP_DELAY_MS, 450),
    textTokenDelayMs: readNonNegativeInteger(env.TEXT_TOKEN_DELAY_MS, 30),
  };
}
