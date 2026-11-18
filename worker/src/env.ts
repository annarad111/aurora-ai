import { isoDateSchema, type IsoDate } from '@aurora/shared';
import { DEFAULT_WORKERS_AI_MODEL } from './llm/workers-ai-model';

/** Bindings and variables configured in wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Workers AI. Only used when NARRATIVE_PROVIDER is "llm". */
  AI?: Ai;
  /** Secret for /mcp (`wrangler secret put MCP_TOKEN`; locally in .dev.vars). */
  MCP_TOKEN?: string;
  /** Rate limiting bindings ("ratelimits" in wrangler.jsonc). */
  CHAT_RATE_LIMITER?: RateLimit;
  MCP_RATE_LIMITER?: RateLimit;
  DEMO_TODAY?: string;
  STREAM_STEP_DELAY_MS?: string;
  TEXT_TOKEN_DELAY_MS?: string;
  /** "llm" (Workers AI, with template fallback) or "scripted" (templates only). */
  NARRATIVE_PROVIDER?: string;
  AI_MODEL?: string;
  AI_TIMEOUT_MS?: string;
}

export interface WorkerConfig {
  /** The date the hotel treats as today. */
  today: IsoDate;
  /** Pause between the run's steps, in milliseconds. */
  stepDelayMs: number;
  /** Pause between streamed words, in milliseconds. */
  textTokenDelayMs: number;
  narrativeProvider: 'llm' | 'scripted';
  aiModel: string;
  /** How long one model call may take before the templates take over. */
  aiTimeoutMs: number;
}

const DEFAULT_TODAY: IsoDate = '2026-11-17';

function readNonNegativeInteger(rawValue: string | undefined, fallback: number): number {
  const parsedValue = Number(rawValue);
  return rawValue !== undefined && rawValue !== '' && Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

type ConfigVariables = Omit<Env, 'DB' | 'ASSETS' | 'AI' | 'MCP_TOKEN' | 'CHAT_RATE_LIMITER' | 'MCP_RATE_LIMITER'>;

/** Reads and checks the plain-text variables, with safe defaults. */
export function readWorkerConfig(env: ConfigVariables): WorkerConfig {
  const parsedToday = isoDateSchema.safeParse(env.DEMO_TODAY);
  return {
    today: parsedToday.success ? parsedToday.data : DEFAULT_TODAY,
    stepDelayMs: readNonNegativeInteger(env.STREAM_STEP_DELAY_MS, 450),
    textTokenDelayMs: readNonNegativeInteger(env.TEXT_TOKEN_DELAY_MS, 30),
    narrativeProvider: env.NARRATIVE_PROVIDER === 'llm' ? 'llm' : 'scripted',
    aiModel: env.AI_MODEL?.trim() || DEFAULT_WORKERS_AI_MODEL,
    aiTimeoutMs: readNonNegativeInteger(env.AI_TIMEOUT_MS, 15_000),
  };
}
