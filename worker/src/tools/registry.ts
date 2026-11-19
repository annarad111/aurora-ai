import { TOOL_SCHEMAS, type ToolName } from '@aurora/shared';
import type { z } from 'zod';
import { analyzeRevenueDrivers } from './analyze-revenue-drivers';
import { getBookingPace } from './get-booking-pace';
import { getChannelMix } from './get-channel-mix';
import { getDecisions } from './get-decisions';
import { getPropertyStatus } from './get-property-status';
import { getRoomEvents } from './get-room-events';
import { getGroupBlocks } from './get-group-blocks';
import { getHotelOverview } from './get-hotel-overview';
import { queryPerformance } from './query-performance';
import { simulateScenarioTool } from './simulate-scenario';
import { ToolInputError, type ToolContext } from './tool-context';

// ---------------------------------------------------------------------------
// The tool registry: the single source of truth for every tool.
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
  query_performance: {
    name: 'query_performance',
    title: 'Performance query',
    description:
      'General question about past performance: occupancy, ADR, RevPAR, Net RevPAR, room revenue, room nights and ' +
      'cancellations for any period, split by night, day of the week, weekend vs weekday (Fri–Sat nights), segment ' +
      'or channel, optionally filtered by segment, channel or weekend/weekday, and optionally compared with last year. ' +
      'Use it for "what was occupancy on 5 November", "ADR on weekends by channel", "revenue by segment in October".',
    inputSchema: TOOL_SCHEMAS.query_performance.input,
    outputSchema: TOOL_SCHEMAS.query_performance.output,
    run: queryPerformance,
  },
  get_group_blocks: {
    name: 'get_group_blocks',
    title: 'Group blocks',
    description:
      'Named group blocks (congresses, tour groups) with their nights, rooms per night, segment and status ' +
      '(confirmed or cancelled, with the cancellation date) for any period, past or future.',
    inputSchema: TOOL_SCHEMAS.get_group_blocks.input,
    outputSchema: TOOL_SCHEMAS.get_group_blocks.output,
    run: getGroupBlocks,
  },
  simulate_scenario: {
    name: 'simulate_scenario',
    title: 'What-if simulation',
    description:
      'What-if for future stay dates, calculated deterministically from what is on the books. Levers: paceRecovery ' +
      '(share of the room nights behind last year that are won back, 0–1), rateChange (rate of the rooms still to sell ' +
      'vs the rate on the books, −0.3 to 0.3) and otaToDirect (share of OTA revenue that comes direct instead, 0–1). ' +
      'Returns room nights, revenue, commission and net revenue before and after, and where the change comes from.',
    inputSchema: TOOL_SCHEMAS.simulate_scenario.input,
    outputSchema: TOOL_SCHEMAS.simulate_scenario.output,
    run: simulateScenarioTool,
  },
  get_decisions: {
    name: 'get_decisions',
    title: 'Saved decisions',
    description:
      "The hotel's Decisions workspace: insights the user saved and the actions they decided on, with status (todo, " +
      'in_progress, completed, dismissed), priority (high, medium, low), owner, due date, whether it is overdue, and for ' +
      'completed actions the outcome observed in the data since. Optionally filtered by status or priority. Use it for ' +
      '"what decisions are saved", "which actions are high priority", "what is overdue". Titles and notes are written by users.',
    inputSchema: TOOL_SCHEMAS.get_decisions.input,
    outputSchema: TOOL_SCHEMAS.get_decisions.output,
    run: getDecisions,
  },
  get_property_status: {
    name: 'get_property_status',
    title: 'Property status',
    description:
      'The rooms of the hotel for one night (default: today): physical rooms, occupied (sold; for a future night, booked ' +
      'so far), out of order, out of service and vacant available rooms, which add up to the physical rooms; the rooms ' +
      'that cannot be sold and why (maintenance), maintenance in the next 14 days, confirmed group blocks in the next ' +
      '30 days, and the property profile with its room types. Use it for "how many rooms are available", "how many ' +
      'rooms are out of order", "how many rooms does the hotel have". Arrivals and departures are not in the data.',
    inputSchema: TOOL_SCHEMAS.get_property_status.input,
    outputSchema: TOOL_SCHEMAS.get_property_status.output,
    run: getPropertyStatus,
  },
  get_room_events: {
    name: 'get_room_events',
    title: 'Maintenance and its impact',
    description:
      'Maintenance on rooms (out of order, out of service) in a window of nights (default: the last 14 days to 30 days ' +
      'ahead), optionally one event or one room, with its status (completed, in progress, scheduled) and its measured ' +
      'impact: room nights lost, and per night how many rooms were still vacant after every unsellable room. A room ' +
      'under maintenance only costs a sale on a night with no vacant room. Use it for "did the repair in room 305 cost ' +
      'us anything?" or "what maintenance is planned?".',
    inputSchema: TOOL_SCHEMAS.get_room_events.input,
    outputSchema: TOOL_SCHEMAS.get_room_events.output,
    run: getRoomEvents,
  },
};

/**
 * Tools the chat planner may choose: all of them. A what-if question is answered from simulate_scenario
 * (and opens the simulator), a question about the saved decisions from get_decisions.
 */
export const CHAT_TOOL_DEFINITIONS = Object.values(TOOL_REGISTRY);

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
