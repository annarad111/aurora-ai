import {
  bookingPaceInputSchema,
  periodToolInputSchema,
  queryPerformanceInputSchema,
  TOOL_NAMES,
  type ConversationTurn,
  type DateRange,
  type IsoDate,
  type ToolName,
} from '@aurora/shared';
import { z } from 'zod';
import type { LanguageModel, LanguageModelToolCall } from '../llm/language-model';
import { TOOL_DEFINITIONS } from '../tools/registry';
import { monthToDate } from './analysis-context';
import { isFollowUpQuestion, planFollowUp } from './follow-up';
import { dataQuestionPlan, groupBlocksPlan, planFromToolNames, planInsightRun, type InsightPlan } from './insight-plan';
import { buildPlannerRequest, buildPlannerSystemPrompt } from './prompts';
import { parseDataQuestion, parseMetric } from './question-parser';

export interface PlannedRun extends InsightPlan {
  plannedBy: 'llm' | 'keywords';
  /** The earlier question this one was read as a follow-up to. */
  followUpOf?: string;
}

/** What a planner needs to know besides the question. */
export interface PlanningContext {
  today: IsoDate;
  /** Earlier questions of the conversation, oldest first. */
  history?: ConversationTurn[];
}

/** A follow-up resolved by the deterministic rules, or null. Both planners try this first. */
function planAsFollowUp(question: string, context: PlanningContext): PlannedRun | null {
  const previousTurn = context.history?.at(-1);
  const plan = planFollowUp(question, previousTurn, context.today);
  return plan && previousTurn ? { ...plan, plannedBy: 'keywords', followUpOf: previousTurn.question } : null;
}

/** Decides which tools a question needs, and with which arguments. */
export interface InsightPlanner {
  plan(question: string, signal: AbortSignal, context: PlanningContext): Promise<PlannedRun>;
}

/** Keyword rules. Instant and deterministic; also the fallback of the model planner. */
export class KeywordInsightPlanner implements InsightPlanner {
  async plan(question: string, _signal: AbortSignal, context: PlanningContext): Promise<PlannedRun> {
    return planAsFollowUp(question, context) ?? { ...planInsightRun(question, context.today), plannedBy: 'keywords' };
  }
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * The JSON Schema the model sees for a tool's arguments: generated from the
 * same Zod schema that validates them, without hotelId (the run always sets
 * the hotel itself, so a model can never read another hotel's data).
 */
export function toolParametersFor(inputSchema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(inputSchema, { io: 'input', unrepresentable: 'any' }) as {
    $schema?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  delete jsonSchema.$schema;
  if (jsonSchema.properties) delete jsonSchema.properties.hotelId;
  if (jsonSchema.required) jsonSchema.required = jsonSchema.required.filter((field) => field !== 'hotelId');
  return jsonSchema;
}

/**
 * Models often send values as text: "false" for false, "ota, direct" for a list,
 * "null" or "" for "not given". This turns those into what the schema expects;
 * the schema still validates the result.
 */
export function normalizeModelArguments(rawArguments: unknown): Record<string, unknown> {
  if (!rawArguments || typeof rawArguments !== 'object' || Array.isArray(rawArguments)) return {};
  const normalized: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(rawArguments as Record<string, unknown>)) {
    if (value === null || value === '' || value === 'null' || value === 'none') continue;
    if (value === 'true' || value === 'false') normalized[name] = value === 'true';
    else if ((name === 'segments' || name === 'channels') && typeof value === 'string') {
      normalized[name] = value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
    } else if (name === 'period' && typeof value === 'object') normalized[name] = normalizeModelArguments(value);
    else normalized[name] = value;
  }
  return normalized;
}

function argumentsOf(call: LanguageModelToolCall): Record<string, unknown> {
  return normalizeModelArguments(call.arguments);
}

/** Placeholder hotel id used only to validate the model's arguments; the real one is set when the tool runs. */
const VALIDATION_HOTEL_ID = 'validation';

/**
 * Turns the model's tool calls into a plan. Arguments are validated with the
 * tools' own schemas; anything invalid throws, and the keyword rules take over.
 */
export function planFromToolCalls(calls: LanguageModelToolCall[], question: string, today: IsoDate): InsightPlan {
  const knownCalls = calls.filter((call) => isToolName(call.name));
  if (knownCalls.length === 0) throw new Error('The model called no known tool');

  // A data question: query_performance with the model's arguments.
  const queryCall = knownCalls.find((call) => call.name === 'query_performance');
  if (queryCall) {
    const parsed = queryPerformanceInputSchema.safeParse({ ...argumentsOf(queryCall), hotelId: VALIDATION_HOTEL_ID });
    if (!parsed.success) throw new Error(`Invalid query_performance arguments: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
    const { hotelId: _hotelId, ...query } = parsed.data;
    const parsedQuestion = parseDataQuestion(question, today);
    return dataQuestionPlan(query, {
      primaryMetric: parseMetric(question) ?? 'room_revenue',
      rankBy: parsedQuestion?.rankBy ?? 'value',
    });
  }

  const blocksCall = knownCalls.find((call) => call.name === 'get_group_blocks');
  if (blocksCall) {
    const parsed = periodToolInputSchema.safeParse({ ...argumentsOf(blocksCall), hotelId: VALIDATION_HOTEL_ID });
    if (!parsed.success) throw new Error('Invalid get_group_blocks arguments');
    return groupBlocksPlan(parsed.data.period);
  }

  // An analysis: the tools decide the intent; a valid past period or pace window from the model is used too.
  const plan = planFromToolNames(knownCalls.map((call) => call.name as ToolName));
  const defaultPeriod = monthToDate(today);
  const periodOverride = knownCalls
    .map((call) => periodToolInputSchema.safeParse({ ...argumentsOf(call), hotelId: VALIDATION_HOTEL_ID }))
    .flatMap((result) => (result.success ? [result.data.period] : []))
    .find((period: DateRange) => period.to <= today && (period.from !== defaultPeriod.from || period.to !== defaultPeriod.to));
  const paceCall = knownCalls.find((call) => call.name === 'get_booking_pace');
  const paceArguments = paceCall ? bookingPaceInputSchema.safeParse({ ...argumentsOf(paceCall), hotelId: VALIDATION_HOTEL_ID }) : null;
  const paceWindowOverride =
    paceArguments?.success && paceArguments.data.stayFrom > today && paceArguments.data.stayFrom <= paceArguments.data.stayTo
      ? { from: paceArguments.data.stayFrom, to: paceArguments.data.stayTo }
      : undefined;
  return { ...plan, ...(periodOverride ? { periodOverride } : {}), ...(paceWindowOverride ? { paceWindowOverride } : {}) };
}

/**
 * The language model chooses tools and their arguments through function
 * calling. If it fails, is slow, or sends unusable arguments, the keyword
 * rules decide instead.
 */
export class LanguageModelInsightPlanner implements InsightPlanner {
  constructor(
    private readonly model: LanguageModel,
    private readonly fallback: InsightPlanner = new KeywordInsightPlanner(),
  ) {}

  async plan(question: string, signal: AbortSignal, context: PlanningContext): Promise<PlannedRun> {
    const followUp = planAsFollowUp(question, context);
    if (followUp) return followUp;
    const previousTurn = context.history?.at(-1);
    try {
      const response = await this.model.complete(
        {
          system: buildPlannerSystemPrompt(context.today, monthToDate(context.today)),
          user: buildPlannerRequest(question, context.history ?? []),
          tools: TOOL_DEFINITIONS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: toolParametersFor(tool.inputSchema as z.ZodType),
          })),
          maxTokens: 400,
          temperature: 0,
        },
        signal,
      );
      if (response.toolCalls.length === 0) {
        // Include the start of what the model said instead, to diagnose prompt or format problems.
        throw new Error(`The model called no known tool. It answered: ${JSON.stringify(response.text.slice(0, 300))}`);
      }
      const plan = planFromToolCalls(response.toolCalls, question, context.today);
      // The model saw the earlier questions; a short question it answered with their help is a follow-up too.
      return { ...plan, plannedBy: 'llm', ...(previousTurn && isFollowUpQuestion(question) ? { followUpOf: previousTurn.question } : {}) };
    } catch (error) {
      console.warn('[Aurora] tool planning fell back to keyword rules:', error instanceof Error ? error.message : error);
      return this.fallback.plan(question, signal, context);
    }
  }
}
