// ---------------------------------------------------------------------------
// The smallest interface Aurora needs from a language model.
//
// The orchestrator only talks to this interface, so the model can be swapped
// (Workers AI today, another provider later) and tests can use a fake model
// that answers instantly and predictably.
// ---------------------------------------------------------------------------

export interface LanguageModelTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments. Without it the tool takes no arguments. */
  parameters?: Record<string, unknown>;
}

/** One tool call the model asked for. Arguments are untrusted: they are validated before use. */
export interface LanguageModelToolCall {
  name: string;
  arguments: unknown;
}

export interface LanguageModelRequest {
  system: string;
  user: string;
  /** When given, the model may answer with tool calls instead of (or as well as) text. */
  tools?: LanguageModelTool[];
  maxTokens: number;
  /** Low values keep answers close to the facts. */
  temperature: number;
}

export interface LanguageModelResponse {
  text: string;
  /** Names of the tools the model asked to call, in order. */
  toolNames: string[];
  /** The same calls with their arguments. */
  toolCalls: LanguageModelToolCall[];
}

export interface LanguageModel {
  readonly modelId: string;
  complete(request: LanguageModelRequest, signal: AbortSignal): Promise<LanguageModelResponse>;
}

/** The model could not answer: timeout, quota, network, unexpected response. */
export class LanguageModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LanguageModelError';
  }
}

/** Rejects with a LanguageModelError if the work takes longer than `timeoutMs` or the run is stopped. */
export function withTimeout<Result>(work: Promise<Result>, timeoutMs: number, signal: AbortSignal): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LanguageModelError(`The model did not answer within ${timeoutMs / 1000} s`)), timeoutMs);
    const onAbort = () => reject(new LanguageModelError('The run was stopped'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (result) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(new LanguageModelError(error instanceof Error ? error.message : String(error)));
      },
    );
  });
}
