import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAccess } from '@/lib/mcp/access';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';

export function registerCatalogOnMcpServer(
  server: McpServer,
  tools: CatalogTool[],
  ctx: McpContext,
  access: McpAccess,
): void {
  for (const catalogTool of tools) {
    const shape =
      catalogTool.inputSchema instanceof z.ZodObject
        ? catalogTool.inputSchema.shape
        : { input: catalogTool.inputSchema };

    server.tool(
      catalogTool.name,
      catalogTool.description,
      shape,
      safe(async (args) => json(await catalogTool.execute(args, ctx, access))),
    );
  }
}
