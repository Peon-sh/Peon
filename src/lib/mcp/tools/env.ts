import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServiceModule } from '@/services/internal/service/service';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerEnvTools(server: McpServer, _ctx: McpContext, access: McpAccess) {
  const { serviceAccess } = access;

  server.tool(
    'list_env',
    'List environment variables of a service. Values are masked unless reveal=true (requires manage access).',
    {
      serviceId: z.string().describe('The service ID'),
      reveal: z.boolean().optional().describe('Return decrypted values (requires manage access)'),
    },
    safe(async ({ serviceId, reveal }) => {
      await serviceAccess(serviceId, reveal === true);
      return json(await ServiceModule.listEnv(serviceId, { reveal: reveal === true }));
    }),
  );

  server.tool(
    'set_env',
    'Create or update an environment variable on a service. Requires manage access. Redeploy for changes to take effect.',
    {
      serviceId: z.string().describe('The service ID'),
      key: z.string().min(1).describe('Variable name'),
      value: z.string().describe('Variable value'),
      isBuildtime: z.boolean().optional().describe('Available at build time (default true)'),
      isRuntime: z.boolean().optional().describe('Available at runtime (default true)'),
      isPreview: z.boolean().optional().describe('Preview-env only (default false)'),
    },
    safe(async ({ serviceId, key, value, isBuildtime, isRuntime, isPreview }) => {
      await serviceAccess(serviceId, true);
      return json(
        await ServiceModule.upsertEnv(serviceId, {
          key,
          value,
          isPreview: isPreview ?? false,
          isBuildtime: isBuildtime ?? true,
          isRuntime: isRuntime ?? true,
          isMultiline: false,
          isLiteral: false,
        }),
      );
    }),
  );

  server.tool(
    'delete_env',
    'Delete an environment variable. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      envId: z.string().describe('Environment variable ID'),
    },
    safe(async ({ serviceId, envId }) => {
      await serviceAccess(serviceId, true);
      await ServiceModule.deleteEnv(serviceId, envId);
      return json({ deleted: true, envId });
    }),
  );

  server.tool(
    'bulk_set_env',
    'Bulk create/update env vars from a .env-style string (KEY=value lines). Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      raw: z.string().describe('Env file contents (KEY=value per line)'),
      isPreview: z.boolean().optional().describe('Apply to preview env (default false)'),
    },
    safe(async ({ serviceId, raw, isPreview }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.bulkSaveEnv(serviceId, raw, { isPreview }));
    }),
  );

  server.tool(
    'import_preview_env',
    'Copy production env vars into preview env. Requires manage access.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.importPreviewEnvFromProduction(serviceId));
    }),
  );
}

export function buildEnvTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerEnvTools);
}
