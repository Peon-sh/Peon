import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAccess } from '@/lib/mcp/access';
import { SECRET_WRITE_TOOLS } from '@/lib/mcp/catalog/classify';
import type { CatalogTool, ToolKind } from '@/lib/mcp/catalog/types';
import type { McpContext } from '@/lib/mcp/helpers';

type LegacyResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

type LegacyHandler = (args: unknown) => Promise<LegacyResult>;

interface LegacyRegistration {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  handler: LegacyHandler;
}

type RegisterLegacyTools = (server: McpServer, ctx: McpContext, access: McpAccess) => void;

function collect(
  register: RegisterLegacyTools,
  ctx: McpContext,
  access: McpAccess,
): LegacyRegistration[] {
  const registrations: LegacyRegistration[] = [];
  const server = {
    tool(
      name: string,
      description: string,
      shape: z.ZodRawShape,
      handler: LegacyHandler,
    ) {
      registrations.push({ name, description, shape, handler });
    },
  } as unknown as McpServer;

  register(server, ctx, access);
  return registrations;
}

function kindFor(name: string): ToolKind {
  if (SECRET_WRITE_TOOLS.has(name)) {
    return 'secret-write';
  }
  if (
    name.startsWith('list_') ||
    name.startsWith('get_') ||
    name.endsWith('_status') ||
    name.endsWith('_logs')
  ) {
    return 'read';
  }
  return 'mutating';
}

function redactInputKeysFor(name: string): string[] | undefined {
  if (name === 'set_env') return ['value'];
  if (name === 'bulk_set_env') return ['raw'];
  if (name === 'update_service_config') return ['values'];
  if (name === 'create_private_key') return ['privateKey'];
  if (name === 'create_storage' || name === 'update_storage') {
    return ['accessKey', 'secretKey'];
  }
  return undefined;
}

/**
 * Transitional bridge for the existing domain definitions. It captures their
 * exact names, descriptions, and schemas while exposing plain-data executors.
 */
export function buildCatalogFromLegacy(
  register: RegisterLegacyTools,
): CatalogTool[] {
  const metadata = collect(register, {} as McpContext, {} as McpAccess);

  return metadata.map(({ name, description, shape }) => ({
    name,
    description,
    kind: kindFor(name),
    inputSchema: z.object(shape),
    redactInputKeys: redactInputKeysFor(name),
    execute: async (args, executeContext, access) => {
      const registration = collect(register, executeContext, access).find(
        (candidate) => candidate.name === name,
      );
      if (!registration) {
        throw new Error(`MCP tool registration missing: ${name}`);
      }
      const result = await registration.handler(args);
      const text = result.content[0]?.text ?? 'null';
      if (result.isError) {
        throw new Error(text);
      }
      return JSON.parse(text) as unknown;
    },
  }));
}
