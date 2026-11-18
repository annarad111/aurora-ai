import { TOOL_SCHEMAS, type ToolName } from '@aurora/shared';
import type { z } from 'zod';
import { analyzeRevenueDrivers } from './analyze-revenue-drivers';
import { getBookingPace } from './get-booking-pace';
import { getChannelMix } from './get-channel-mix';
import { getHotelOverview } from './get-hotel-overview';
import { ToolInputError, type ToolContext } from './tool-context';

// ---------------------------------------------------------------------------
// The tool registry: the single source of truth for the four tools.
//
// Two adapters will sit on top of it:
//   - the chat orchestrator calls `callTool` directly, in the same process (step 4)
//   - the MCP server at /mcp publishes the same name, description and schemas (step 9)
// So an analysis is written once and is available in both places.
// ---------------------------------------------------------------------------

export type ToolInput<Name extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[Name]['input']>;
export type ToolOutput<Name extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[Name]['output']>;

export interface ToolDefinition<Name extends ToolName> {
  name: Name;
  /** Short human title, shown in MCP clients. */
  title: string;
  /** What the tool is for. Written for a language model choosing between tools. */
  description: string;
  inputSchema: (typeof TOOL_SCHEMAS)[Name]['input'];
  outputSchema: (typeof TOOL_SCHEMAS)[Name]['output'];
  run: (input: ToolInput<Name>, context: ToolContext) => Promise<ToolOutput<Name>>;
}

export const TOOL_REGISTRY: { [Name in ToolName]: ToolDefinition<Name> } = {
  get_hotel_overview: {
    name: 'get_hotel_overview',
    title: 'Hotel overview',
    description:
      'Occupancy, ADR, RevPAR, room revenue and room nights for a period, each compared with target and last year, ' +
      'with a status (on_track / watch / off_track). Also returns room nights per segment and occupancy per night. ' +
      'Use it first to see how the hotel is doing.',
    inputSchema: TOOL_SCHEMAS.get_hotel_overview.input,
    outputSchema: TOOL_SCHEMAS.get_hotel_overview.output,
    run: getHotelOverview,
  },
  analyze_revenue_drivers: {
    name: 'analyze_revenue_drivers',
    title: 'Revenue drivers',
    description:
      'Explains why room revenue differs from target. Splits the gap exactly into a volume effect (room nights), ' +
      'a segment mix effect and a pure price effect, also per segment, and returns findings ranked by euro impact.',
    inputSchema: TOOL_SCHEMAS.analyze_revenue_drivers.input,
    outputSchema: TOOL_SCHEMAS.analyze_revenue_drivers.output,
    run: analyzeRevenueDrivers,
  },
  get_channel_mix: {
    name: 'get_channel_mix',
    title: 'Channel mix and commissions',
    description:
      'Share of room revenue per distribution channel (direct, OTA, GDS, wholesale) compared with last year and the ' +
      'previous two months, the commission paid, and Net RevPAR (RevPAR after commissions).',
    inputSchema: TOOL_SCHEMAS.get_channel_mix.input,
    outputSchema: TOOL_SCHEMAS.get_channel_mix.output,
    run: getChannelMix,
  },
  get_booking_pace: {
    name: 'get_booking_pace',
    title: 'Booking pace',
    description:
      'Room nights already on the books for future stay dates, compared with the same point last year, plus the pickup ' +
      'of the last 7 days. Use it to judge the risk for the rest of the month.',
    inputSchema: TOOL_SCHEMAS.get_booking_pace.input,
    outputSchema: TOOL_SCHEMAS.get_booking_pace.output,
    run: getBookingPace,
  },
};

export const TOOL_DEFINITIONS = Object.values(TOOL_REGISTRY);

/**
 * Calls a tool safely: validates the input, runs it, and validates the output
 * against its schema, so a bug can never send a malformed result to the UI or to an MCP client.
 */
export async function callTool<Name extends ToolName>(name: Name, rawInput: unknown, context: ToolContext): Promise<ToolOutput<Name>> {
  const tool = TOOL_REGISTRY[name] as ToolDefinition<Name>;
  const parsedInput = tool.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new ToolInputError('invalid_input', `Invalid input for ${name}: ${parsedInput.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  const output = await tool.run(parsedInput.data as ToolInput<Name>, context);
  return tool.outputSchema.parse(output) as ToolOutput<Name>;
}
