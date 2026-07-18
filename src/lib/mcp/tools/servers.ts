import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/queue/sqs';
import { ServerService } from '@/services/internal/server/server';
import {
  createServerSchema,
  updateServerSchema,
  deleteServerSchema,
  createDestinationSchema,
} from '@/schemas/server.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerServerTools(server: McpServer, ctx: McpContext, access: McpAccess) {
  const { infra, assertServerInWorkspace } = access;

  server.tool(
    'list_servers',
    'List servers in the workspace (requires OWNER or ADMIN role).',
    {},
    safe(async () => {
      await infra();
      return json(await ServerService.list(ctx.workspaceId));
    }),
  );

  server.tool(
    'get_server',
    'Get details of a server by ID (requires OWNER or ADMIN role).',
    { serverId: z.string().describe('The server ID') },
    safe(async ({ serverId }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      return json(await ServerService.get(serverId));
    }),
  );

  server.tool(
    'create_server',
    'Create a server in the workspace (requires OWNER or ADMIN role).',
    {
      name: z.string().min(1).max(80).describe('Server name'),
      description: z.string().max(500).optional().describe('Description'),
      ip: z.string().min(1).max(255).describe('SSH host / IP'),
      port: z.number().int().min(1).max(65535).optional().describe('SSH port (default 22)'),
      user: z.string().min(1).max(80).optional().describe('SSH user (default root)'),
      privateKeyId: z.string().min(1).describe('Private key ID for SSH'),
      proxyType: z.enum(['TRAEFIK', 'CADDY', 'NONE']).optional().describe('Proxy type'),
    },
    safe(async (args) => {
      await infra();
      const body = createServerSchema.parse(args);
      return json(await ServerService.create(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'update_server',
    'Update a server (requires OWNER or ADMIN role).',
    {
      serverId: z.string().describe('The server ID'),
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(500).nullable().optional(),
      ip: z.string().min(1).max(255).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      user: z.string().min(1).max(80).optional(),
      privateKeyId: z.string().min(1).nullable().optional(),
      proxyType: z.enum(['TRAEFIK', 'CADDY', 'NONE']).optional(),
      isBuildServer: z.boolean().optional(),
      forceDisabled: z.boolean().optional(),
      wildcardDomain: z.string().max(255).nullable().optional(),
      connectionTimeout: z.number().int().min(1).max(300).optional(),
      concurrentBuilds: z.number().int().min(1).max(50).optional(),
      deploymentQueueLimit: z.number().int().min(1).max(500).optional(),
      isMetricsEnabled: z.boolean().optional(),
      isSentinelEnabled: z.boolean().optional(),
      isTerminalEnabled: z.boolean().optional(),
      isCloudflareTunnel: z.boolean().optional(),
      forceDockerCleanup: z.boolean().optional(),
      dockerCleanupFrequency: z.string().max(80).optional(),
      dockerCleanupThreshold: z.number().int().min(1).max(100).optional(),
      deleteUnusedVolumes: z.boolean().optional(),
      deleteUnusedNetworks: z.boolean().optional(),
      diskUsageNotificationThreshold: z.number().int().min(1).max(100).optional(),
    },
    safe(async ({ serverId, ...rest }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      const body = updateServerSchema.parse(rest);
      return json(await ServerService.update(serverId, body));
    }),
  );

  server.tool(
    'delete_server',
    'Delete a server. confirmName must match the server name (requires OWNER or ADMIN).',
    {
      serverId: z.string().describe('The server ID'),
      confirmName: z.string().min(1).max(80).describe('Must match the server name exactly'),
      deleteResources: z
        .boolean()
        .optional()
        .describe('Also tear down services on this server (default false)'),
    },
    safe(async ({ serverId, confirmName, deleteResources }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      const body = deleteServerSchema.parse({ confirmName, deleteResources });
      await ServerService.remove(serverId, body);
      return json({ deleted: true, serverId });
    }),
  );

  server.tool(
    'list_server_resources',
    'List services and destinations attached to a server (requires OWNER or ADMIN).',
    { serverId: z.string().describe('The server ID') },
    safe(async ({ serverId }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      return json(await ServerService.listResources(serverId));
    }),
  );

  server.tool(
    'validate_server',
    'Queue server validation (SSH reachability, Docker). Requires OWNER or ADMIN. Returns a sessionId to poll via get_server_logs.',
    {
      serverId: z.string().describe('The server ID'),
      installDocker: z.boolean().optional().describe('Install Docker if missing (default true)'),
    },
    safe(async ({ serverId, installDocker }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      const sessionId = randomUUID();
      await prisma.serverOperationLog.create({
        data: { serverId, sessionId, operation: 'validate', message: 'Validation queued.' },
      });
      await enqueue({
        type: 'server.validate',
        serverId,
        installDocker: installDocker ?? true,
        sessionId,
      });
      return json({ queued: true, sessionId });
    }),
  );

  server.tool(
    'cleanup_server',
    'Queue Docker cleanup on a server (unused images/volumes). Requires OWNER or ADMIN. Poll get_server_logs with the sessionId.',
    { serverId: z.string().describe('The server ID') },
    safe(async ({ serverId }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      const sessionId = randomUUID();
      await prisma.serverOperationLog.create({
        data: { serverId, sessionId, operation: 'cleanup', message: 'Cleanup queued.' },
      });
      await enqueue({ type: 'server.cleanup', serverId, sessionId });
      return json({ queued: true, sessionId });
    }),
  );

  server.tool(
    'get_server_logs',
    'Get the latest server operation log session (validate/cleanup). Requires OWNER or ADMIN.',
    { serverId: z.string().describe('The server ID') },
    safe(async ({ serverId }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      const latest = await prisma.serverOperationLog.findFirst({
        where: { serverId },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) return json([]);
      const logs = await prisma.serverOperationLog.findMany({
        where: latest.sessionId
          ? { serverId, sessionId: latest.sessionId }
          : { serverId, sessionId: null },
        orderBy: { createdAt: 'asc' },
        take: 80,
      });
      return json(logs);
    }),
  );

  server.tool(
    'list_destinations',
    'List Docker destinations (networks) on a server. Requires OWNER or ADMIN.',
    { serverId: z.string().describe('The server ID') },
    safe(async ({ serverId }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      return json(await ServerService.listDestinations(serverId));
    }),
  );

  server.tool(
    'create_destination',
    'Create a destination (Docker network) on a server. Requires OWNER or ADMIN.',
    {
      serverId: z.string().describe('The server ID'),
      name: z.string().min(1).max(80).describe('Destination name'),
      network: z.string().min(1).max(80).optional().describe('Docker network name (default peon)'),
      isSwarm: z.boolean().optional().describe('Swarm mode (default false)'),
    },
    safe(async ({ serverId, ...rest }) => {
      await infra();
      await assertServerInWorkspace(serverId);
      const body = createDestinationSchema.parse(rest);
      return json(await ServerService.createDestination(serverId, body));
    }),
  );

  server.tool(
    'delete_destination',
    'Delete a destination. Requires OWNER or ADMIN.',
    { destinationId: z.string().describe('The destination ID') },
    safe(async ({ destinationId }) => {
      await infra();
      const serverId = await ServerService.destinationServerId(destinationId);
      await assertServerInWorkspace(serverId);
      await ServerService.removeDestination(destinationId);
      return json({ deleted: true, destinationId });
    }),
  );
}

export function buildServerTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerServerTools);
}
