import {
  LanguageModelError,
  withTimeout,
  type LanguageModel,
  type LanguageModelRequest,
  type LanguageModelResponse,
  type LanguageModelToolCall,
} from './language-model';

/** A model on Workers AI that supports function calling. Can be changed with the AI_MODEL variable. */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

type WorkersAiToolCall = { name?: unknown; arguments?: unknown; function?: { name?: unknown; arguments?: unknown } };

/**
 * What Workers AI returns for text generation, as far as we rely on it.
 * The same model answers in one of two formats:
 *   Workers AI format   { response, tool_calls }
 *   OpenAI format       { choices: [{ message: { content, tool_calls } }] }
 */
interface WorkersAiTextResult {
  response?: unknown;
  tool_calls?: WorkersAiToolCall[];
  choices?: Array<{ message?: { content?: unknown; tool_calls?: WorkersAiToolCall[] } }>;
}

/** Arguments arrive as an object or as a JSON string; anything unreadable becomes an empty object. */
function readArguments(rawArguments: unknown): unknown {
  if (typeof rawArguments !== 'string') return rawArguments ?? {};
  try {
    return JSON.parse(rawArguments);
  } catch {
    return {};
  }
}

/**
 * Reads tool calls written as JSON text, with their arguments:
 *   ["{\"type\": \"function\", \"name\": \"query_performance\", \"parameters\": {…}}", …]  or the same as objects.
 * Only names that were offered are kept.
 */
export function readToolCallsWrittenAsText(text: string, offeredToolNames: readonly string[]): LanguageModelToolCall[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.flatMap((item): LanguageModelToolCall[] => {
    const call = (typeof item === 'string' ? readArguments(item) : item) as { name?: unknown; parameters?: unknown; arguments?: unknown } | null;
    if (!call || typeof call.name !== 'string' || !offeredToolNames.includes(call.name)) return [];
    return [{ name: call.name, arguments: readArguments(call.parameters ?? call.arguments) }];
  });
}

/**
 * Llama sometimes writes its tool calls as JSON text instead of real tool calls:
 *   ["{\"type\": \"function\", \"name\": \"get_hotel_overview\", \"parameters\": {}}", …]
 * We accept a tool name only when it appears as a JSON "name" value and is one
 * of the names we offered, so ordinary prose can never trigger a tool.
 */
export function findToolNamesWrittenAsText(text: string, offeredToolNames: readonly string[]): string[] {
  const writtenNames = [...text.matchAll(/\\?"name\\?"\s*:\s*\\?"([a-z_]+)\\?"/g)].map((match) => match[1]!);
  return [...new Set(writtenNames.filter((name) => offeredToolNames.includes(name)))];
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
          parameters: tool.parameters ?? { type: 'object', properties: {}, required: [] },
        },
      }));
    }

    const rawResult = await withTimeout(runModel(this.modelId, inputs), this.timeoutMs, signal);
    return readWorkersAiResult(rawResult, request.tools?.map((tool) => tool.name) ?? []);
  }
}

/**
 * Reads text and tool calls from either response format, and both tool-call
 * shapes (`{ name }` and `{ function: { name } }`). When tools were offered and
 * none came back as real tool calls, tool calls written as text are accepted too.
 */
export function readWorkersAiResult(rawResult: unknown, offeredToolNames: readonly string[] = []): LanguageModelResponse {
  if (typeof rawResult !== 'object' || rawResult === null) {
    throw new LanguageModelError('The model returned an empty response');
  }
  const result = rawResult as WorkersAiTextResult;
  const message = result.choices?.[0]?.message;

  const rawText = typeof result.response === 'string' ? result.response : typeof message?.content === 'string' ? message.content : '';
  const rawToolCalls = [...(result.tool_calls ?? []), ...(message?.tool_calls ?? [])];
  let toolCalls: LanguageModelToolCall[] = rawToolCalls.flatMap((toolCall) => {
    const name = toolCall.name ?? toolCall.function?.name;
    return typeof name === 'string' ? [{ name, arguments: readArguments(toolCall.arguments ?? toolCall.function?.arguments) }] : [];
  });
  let text = rawText;

  if (toolCalls.length === 0 && offeredToolNames.length > 0) {
    const callsWrittenAsText = readToolCallsWrittenAsText(rawText, offeredToolNames);
    const namesWrittenAsText = callsWrittenAsText.length > 0 ? [] : findToolNamesWrittenAsText(rawText, offeredToolNames);
    if (callsWrittenAsText.length > 0 || namesWrittenAsText.length > 0) {
      toolCalls = callsWrittenAsText.length > 0 ? callsWrittenAsText : namesWrittenAsText.map((name) => ({ name, arguments: {} }));
      text = '';
    }
  }
  const toolNames = toolCalls.map((toolCall) => toolCall.name);

  if (text === '' && toolNames.length === 0) {
    throw new LanguageModelError(`The model returned neither text nor tool calls: ${JSON.stringify(rawResult).slice(0, 400)}`);
  }
  return { text, toolNames, toolCalls };
}
