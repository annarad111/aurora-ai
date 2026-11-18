import { McpServer, type CallToolResult, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import type { Hotel, ToolName } from '@aurora/shared';
import { createMcpHandler } from 'agents/mcp/server';
import { monthToDate, paceWindowFor } from '../orchestrator/analysis-context';
import { callTool, TOOL_DEFINITIONS, type ToolDefinition } from '../tools/registry';
import { ToolInputError, type ToolContext } from '../tools/tool-context';

// ---------------------------------------------------------------------------
// The MCP server at /mcp: the same four tools as the chat, for external agents
// (Claude Desktop, MCP Inspector, any MCP client).
//
// Nothing is defined twice: name, description, input and output schemas and
// the handler all come from tools/registry.ts. The chat calls the registry
// directly in the same process; only outside clients go through MCP.
//
// Stateless: a new McpServer is built for every request (no sessions, no
// Durable Objects), which is what createMcpHandler expects for this mode.
// ---------------------------------------------------------------------------

const SERVER_INFO = { name: 'aurora', title: 'Aurora revenue analytics', version: '0.1.0' };

/** Tells the client's model how to fill in the inputs. The hotels are read from the database. */
function buildServerInstructions(toolContext: ToolContext, hotels: Hotel[]): string {
  const monthToDatePeriod = monthToDate(toolContext.today);
  const paceWindow = paceWindowFor(toolContext.today);
  const hotelLines = hotels.map(
    (hotel) => `- ${hotel.name}, ${hotel.city}: hotelId "${hotel.id}", ${hotel.roomCount} rooms, currency ${hotel.currency}.`,
  );
  return [
    'Read-only revenue analytics for hotels. Every figure is computed deterministically from the hotel data.',
    'Hotels:',
    ...hotelLines,
    `Today is ${toolContext.today}. Month to date is period { "from": "${monthToDatePeriod.from}", "to": "${monthToDatePeriod.to}" }.`,
    `For booking pace use future stay dates, e.g. stayFrom "${paceWindow.from}", stayTo "${paceWindow.to}".`,
    'Dates are YYYY-MM-DD and ranges are inclusive. Ratios are fractions (0.62 = 62%), money is in euros.',
  ].join('\n');
}

function registerRegistryTool(server: McpServer, tool: ToolDefinition<ToolName>, toolContext: ToolContext): void {
  // Zod 4 schemas are Standard Schemas with a JSON Schema export, which is what the SDK publishes in tools/list.
  const inputSchema = tool.inputSchema as StandardSchemaWithJSON;
  const outputSchema = tool.outputSchema as StandardSchemaWithJSON;

  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema,
      outputSchema,
      // Reads only, never changes data, same answer for the same input.
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input: unknown): Promise<CallToolResult> => {
      try {
        // callTool validates the input and the output again, exactly like for the chat.
        const output = await callTool(tool.name, input, toolContext);
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output as Record<string, unknown>,
        };
      } catch (error) {
        // Bad input (unknown hotel, no data) goes back to the client's model so it can correct itself.
        if (error instanceof ToolInputError) {
          return { isError: true, content: [{ type: 'text', text: error.message }] };
        }
        throw error;
      }
    },
  );
}

export async function createAuroraMcpServer(toolContext: ToolContext): Promise<McpServer> {
  const hotels = await toolContext.repository.listHotels();
  const server = new McpServer(SERVER_INFO, { instructions: buildServerInstructions(toolContext, hotels) });
  for (const tool of TOOL_DEFINITIONS) {
    registerRegistryTool(server, tool as unknown as ToolDefinition<ToolName>, toolContext);
  }
  return server;
}

/** Answers one MCP request (Streamable HTTP). Authentication and rate limiting happen before this, in app.ts. */
export function handleMcpRequest(request: Request, toolContext: ToolContext): Promise<Response> {
  const mcpHandler = createMcpHandler(() => createAuroraMcpServer(toolContext), { route: '/mcp' });
  return mcpHandler.fetch(request);
}
