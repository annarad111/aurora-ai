import { z } from 'zod';

/** Every read-only tool, as the chat and the MCP server know it. */
export const TOOL_NAMES = [
  'get_hotel_overview',
  'analyze_revenue_drivers',
  'get_channel_mix',
  'get_booking_pace',
  'query_performance',
  'get_group_blocks',
  'simulate_scenario',
  'get_decisions',
] as const;
export const toolNameSchema = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof toolNameSchema>;
