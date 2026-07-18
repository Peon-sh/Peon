import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCatalogOnMcpServer } from '@/lib/mcp/adapters/mcp';
import { createMcpAccess } from '@/lib/mcp/access';
import { assembleAllTools } from '@/lib/mcp/catalog';
import type { McpContext } from '@/lib/mcp/helpers';
import { registerMcpResources } from '@/lib/mcp/tools/resources';

/**
 * Register the full Peon MCP tool surface. Tools call the internal service
 * layer with the same access rules as the REST API.
 */
export function registerAllTools(server: McpServer, ctx: McpContext) {
  const tools = assembleAllTools(ctx);
  const access = createMcpAccess(ctx);

  registerCatalogOnMcpServer(server, tools, ctx, access);
  registerMcpResources(server, ctx, access);
}

export type { McpContext } from '@/lib/mcp/helpers';
