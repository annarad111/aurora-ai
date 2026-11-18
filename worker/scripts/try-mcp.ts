// Connects to the running Worker's /mcp endpoint as an MCP client, lists the
// tools and calls one, exactly like Claude Desktop or MCP Inspector would.
//
//   npm run dev          (in another terminal)
//   npm run mcp:try      or: npm run mcp:try -- https://aurora.<subdomain>.workers.dev/mcp
//
// The token is read from MCP_TOKEN in the environment, or from .dev.vars.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

function readTokenFromDevVars(): string | undefined {
  try {
    const devVars = readFileSync(resolve(import.meta.dirname, '../../.dev.vars'), 'utf8');
    return /^MCP_TOKEN=(.+)$/m.exec(devVars)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const endpoint = process.argv[2] ?? 'http://127.0.0.1:8787/mcp';
const token = process.env.MCP_TOKEN ?? readTokenFromDevVars();
if (!token) {
  console.error('No MCP_TOKEN found. Set it in .dev.vars (see .dev.vars.example) or in the environment.');
  process.exit(1);
}

const client = new Client({ name: 'aurora-try-mcp', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));

const server = client.getServerVersion();
console.log(`Connected to ${server?.title ?? server?.name} ${server?.version} at ${endpoint}\n`);

const { tools } = await client.listTools();
for (const tool of tools) {
  console.log(`- ${tool.name}${tool.annotations?.readOnlyHint ? ' (read-only)' : ''}: ${tool.description?.slice(0, 90)}…`);
}

const result = await client.callTool({
  name: 'analyze_revenue_drivers',
  arguments: { hotelId: 'sablon-bru', period: { from: '2026-11-01', to: '2026-11-17' } },
});
const drivers = result.structuredContent as { revenueGap: number; volumeEffect: number; mixEffect: number; purePriceEffect: number };
console.log('\nanalyze_revenue_drivers, 1–17 Nov 2026:');
console.log(`  gap ${drivers.revenueGap.toFixed(0)} = volume ${drivers.volumeEffect.toFixed(0)} + mix ${drivers.mixEffect.toFixed(0)} + price ${drivers.purePriceEffect.toFixed(0)}`);

await client.close();
