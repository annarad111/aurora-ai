import { LanguageModelError, withTimeout, type LanguageModel, type LanguageModelRequest, type LanguageModelResponse } from './language-model';

/** A model on Workers AI that supports function calling. Can be changed with the AI_MODEL variable. */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** What Workers AI returns for text generation, as far as we rely on it. */
interface WorkersAiTextResult {
  response?: unknown;
  tool_calls?: Array<{ name?: unknown; function?: { name?: unknown } }>;
}

/**
 * Calls a Workers AI text model through the `AI` binding.
 * The binding's typings list every model with its own input type; we call it
 * with a plain model id from configuration, so the call is typed loosely here
 * and the response is checked by hand instead.
 */
export class WorkersAiLanguageModel implements LanguageModel {
  constructor(
    private readonly ai: Ai,
    readonly modelId: string,
    private readonly timeoutMs: number,
  ) {}

  async complete(request: LanguageModelRequest, signal: AbortSignal): Promise<LanguageModelResponse> {
    const runModel = this.ai.run.bind(this.ai) as unknown as (model: string, inputs: Record<string, unknown>) => Promise<unknown>;

    const inputs: Record<string, unknown> = {
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    };
    if (request.tools && request.tools.length > 0) {
      inputs.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          // The workspace fixes the hotel and the period, so the model only decides which tools to call.
          parameters: { type: 'object', properties: {}, required: [] },
        },
      }));
    }

    const rawResult = await withTimeout(runModel(this.modelId, inputs), this.timeoutMs, signal);
    return readWorkersAiResult(rawResult);
  }
}

/** Accepts both tool-call shapes Workers AI models use: `{ name }` and `{ function: { name } }`. */
export function readWorkersAiResult(rawResult: unknown): LanguageModelResponse {
  if (typeof rawResult !== 'object' || rawResult === null) {
    throw new LanguageModelError('The model returned an empty response');
  }
  const result = rawResult as WorkersAiTextResult;
  const text = typeof result.response === 'string' ? result.response : '';
  const toolNames = (result.tool_calls ?? [])
    .map((toolCall) => toolCall.name ?? toolCall.function?.name)
    .filter((name): name is string => typeof name === 'string');
  return { text, toolNames };
}
