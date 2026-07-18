import { tool } from 'ai';
import type { McpAccess } from '@/lib/mcp/access';
import { redactValue } from '@/lib/mcp/catalog/redact';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import type { McpContext } from '@/lib/mcp/helpers';

export function toAiSdkTools(
  tools: CatalogTool[],
  ctx: McpContext,
  access: McpAccess,
  options: { forChat?: boolean } = {},
) {
  return Object.fromEntries(
    tools
      .filter((catalogTool) => !(options.forChat && catalogTool.chatExclude))
      .map((catalogTool) => [
        catalogTool.name,
        tool({
          description: catalogTool.description,
          inputSchema: catalogTool.inputSchema,
          execute: async (args) => {
            const safeArgs =
              options.forChat && catalogTool.name === 'list_env'
                ? { ...(args as Record<string, unknown>), reveal: false }
                : args;
            const result = await catalogTool.execute(safeArgs, ctx, access);
            return options.forChat && catalogTool.name === 'get_service_config'
              ? redactValue(result)
              : result;
          },
        }),
      ]),
  );
}
