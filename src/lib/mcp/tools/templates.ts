import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listTemplates, listTemplateCategories } from '@/lib/templates';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerTemplateTools(server: McpServer, _ctx: McpContext, access: McpAccess) {
  const { ws } = access;

  server.tool(
    'list_templates',
    'List one-click service templates (optionally filter by search or category).',
    {
      search: z.string().optional().describe('Search query'),
      category: z.string().optional().describe('Category filter'),
    },
    safe(async ({ search, category }) => {
      await ws();
      return json({
        templates: listTemplates({ search, category }),
        categories: listTemplateCategories(),
      });
    }),
  );
}

export function buildTemplateTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerTemplateTools);
}
