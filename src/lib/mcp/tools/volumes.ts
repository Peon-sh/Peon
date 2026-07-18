import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServiceModule } from '@/services/internal/service/service';
import { upsertVolumeSchema } from '@/schemas/service.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerVolumeTools(server: McpServer, _ctx: McpContext, access: McpAccess) {
  const { serviceAccess } = access;

  server.tool(
    'list_volumes',
    'List persistent volumes for a service.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceModule.listVolumes(serviceId));
    }),
  );

  server.tool(
    'create_volume',
    'Create a volume mount for a service. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      name: z.string().min(1).max(120).describe('Volume name'),
      mountPath: z.string().min(1).describe('Container mount path'),
      hostPath: z.string().nullable().optional().describe('Host path for bind mounts'),
      isBindMount: z.boolean().optional().describe('Use bind mount (default false)'),
    },
    safe(async ({ serviceId, ...rest }) => {
      await serviceAccess(serviceId, true);
      const body = upsertVolumeSchema.parse(rest);
      return json(await ServiceModule.createVolume(serviceId, body));
    }),
  );

  server.tool(
    'delete_volume',
    'Delete a volume. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      volumeId: z.string().describe('The volume ID'),
    },
    safe(async ({ serviceId, volumeId }) => {
      await serviceAccess(serviceId, true);
      await ServiceModule.deleteVolume(serviceId, volumeId);
      return json({ deleted: true, volumeId });
    }),
  );
}

export function buildVolumeTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerVolumeTools);
}
