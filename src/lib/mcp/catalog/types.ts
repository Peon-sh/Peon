import type { z } from 'zod';
import type { McpAccess } from '@/lib/mcp/access';
import type { McpContext } from '@/lib/mcp/helpers';

export type ToolKind = 'read' | 'mutating' | 'secret-write';

export interface CatalogTool<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  kind: ToolKind;
  inputSchema: TInput;
  redactInputKeys?: string[];
  /** When true, omit from chat AI adapter (still available on hosted MCP). */
  chatExclude?: boolean;
  execute: (
    args: z.infer<TInput>,
    ctx: McpContext,
    access: McpAccess,
  ) => Promise<unknown>;
}
