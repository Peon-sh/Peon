import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { sshPool } from '@/lib/ssh';
import { teardownService } from '@/services/internal/deploy/engine';
import { checkServerDelete } from '@/services/internal/server/delete-guards';
import { isAgentLive } from '@/services/internal/server/agent';
import type {
  CreateServerInput,
  UpdateServerInput,
  CreateDestinationInput,
  DeleteServerInput,
} from '@/schemas/server.schema';
import { AuditService } from '@/services/internal/audit/audit';

function publicSettings<T extends Record<string, unknown> | null | undefined>(settings: T) {
  if (!settings) return null;
  const { sentinelToken: _omit, ...rest } = settings as T & { sentinelToken?: string | null };
  return {
    ...rest,
    isAgentLive: isAgentLive(
      (rest as { agentLastSeenAt?: Date | string | null }).agentLastSeenAt ?? null,
    ),
  };
}

export const ServerService = {
  async list(workspaceId: string) {
    const servers = await prisma.server.findMany({
      where: { workspaceId },
      include: {
        settings: true,
        privateKey: { select: { id: true, name: true, fingerprint: true } },
        _count: {
          select: {
            destinations: true,
            services: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return servers.map((s) => ({
      ...s,
      settings: publicSettings(s.settings as unknown as Record<string, unknown> | null),
    }));
  },

  async create(workspaceId: string, input: CreateServerInput) {
    await assertPrivateKeyInWorkspace(workspaceId, input.privateKeyId);
    const server = await prisma.server.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description,
        ip: input.ip,
        port: input.port,
        user: input.user,
        privateKeyId: input.privateKeyId,
        proxyType: input.proxyType,
        hostKeyFingerprint: input.hostKeyFingerprint,
        settings: {
          create: {
            forceDockerCleanup: true,
            deleteUnusedVolumes: true,
            deleteUnusedNetworks: true,
          },
        },
        destinations: { create: { name: 'default', network: 'peon' } },
      },
      include: { settings: true, destinations: true },
    });
    await AuditService.record({
      workspaceId,
      action: 'server.created',
      resourceType: 'server',
      resourceId: server.id,
      resourceName: server.name,
      summary: `Created server "${server.name}"`,
    });
    return {
      ...server,
      settings: publicSettings(server.settings as unknown as Record<string, unknown> | null),
    };
  },

  async get(serverId: string) {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      include: {
        settings: true,
        destinations: true,
        privateKey: { select: { id: true, name: true, fingerprint: true } },
        _count: { select: { services: { where: { deletedAt: null } } } },
      },
    });
    if (!server) throw new NotFoundError('Server not found.');
    return {
      ...server,
      settings: publicSettings(server.settings as unknown as Record<string, unknown> | null),
      /** Active services placed on this server. */
      resourceCount: server._count.services,
    };
  },

  /** Active (non-soft-deleted) services placed on this server. */
  async listResources(serverId: string) {
    return prisma.service.findMany({
      where: { serverId, deletedAt: null },
      select: { id: true, name: true, kind: true, uuid: true },
      orderBy: { name: 'asc' },
    });
  },

  async workspaceIdFor(serverId: string): Promise<string> {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { workspaceId: true },
    });
    if (!server) throw new NotFoundError('Server not found.');
    return server.workspaceId;
  },

  async update(serverId: string, input: UpdateServerInput) {
    const {
      forceDisabled,
      wildcardDomain,
      connectionTimeout,
      concurrentBuilds,
      deploymentQueueLimit,
      isMetricsEnabled,
      isSentinelEnabled,
      isTerminalEnabled,
      isCloudflareTunnel,
      forceDockerCleanup,
      dockerCleanupFrequency,
      dockerCleanupThreshold,
      deleteUnusedVolumes,
      deleteUnusedNetworks,
      diskUsageNotificationThreshold,
      privateKeyId,
      ...serverInput
    } = input;

    const existing = await prisma.server.findUnique({
      where: { id: serverId },
      select: { workspaceId: true, privateKeyId: true ,proxyType: true,proxyStatus: true, },
    });
    if (!existing) throw new NotFoundError('Server not found.');

    if (privateKeyId !== undefined && privateKeyId !== null) {
      await assertPrivateKeyInWorkspace(existing.workspaceId, privateKeyId);
    }

    const settingsInput = {
      ...(forceDisabled !== undefined ? { forceDisabled } : {}),
      ...(wildcardDomain !== undefined ? { wildcardDomain } : {}),
      ...(connectionTimeout !== undefined ? { connectionTimeout } : {}),
      ...(concurrentBuilds !== undefined ? { concurrentBuilds } : {}),
      ...(deploymentQueueLimit !== undefined ? { deploymentQueueLimit } : {}),
      ...(isMetricsEnabled !== undefined ? { isMetricsEnabled } : {}),
      ...(isSentinelEnabled !== undefined ? { isSentinelEnabled } : {}),
      ...(isTerminalEnabled !== undefined ? { isTerminalEnabled } : {}),
      ...(isCloudflareTunnel !== undefined ? { isCloudflareTunnel } : {}),
      ...(forceDockerCleanup !== undefined ? { forceDockerCleanup } : {}),
      ...(dockerCleanupFrequency !== undefined ? { dockerCleanupFrequency } : {}),
      ...(dockerCleanupThreshold !== undefined ? { dockerCleanupThreshold } : {}),
      ...(deleteUnusedVolumes !== undefined ? { deleteUnusedVolumes } : {}),
      ...(deleteUnusedNetworks !== undefined ? { deleteUnusedNetworks } : {}),
      ...(diskUsageNotificationThreshold !== undefined ? { diskUsageNotificationThreshold } : {}),
    };

    const keyChanged = privateKeyId !== undefined && privateKeyId !== existing.privateKeyId;

    const proxyTypeChanged = serverInput.proxyType !== undefined && serverInput.proxyType !== existing.proxyType;

    if (proxyTypeChanged && existing.proxyStatus === 'running') {
      throw new ConflictError(
        'Current gateway is running. Turn it off first, then change gateway type.',
      );
    }

    const server = await prisma.server.update({

      where: { id: serverId },
      data: {
        ...serverInput,
        ...(privateKeyId !== undefined ? { privateKeyId } : {}),
        ...(Object.keys(settingsInput).length
          ? {
              settings: {
                upsert: {
                  create: settingsInput,
                  update: settingsInput,
                },
              },
            }
          : {}),
      },
      include: {
        settings: true,
        destinations: true,
        privateKey: { select: { id: true, name: true, fingerprint: true } },
      },
    });

    // Drop any pooled SSH session so the next connect uses the new key/host creds.
    // Includes the host key pin: re-trusting a rebuilt server must not reuse the
    // session that was opened under the old fingerprint.
    if (
      keyChanged ||
      serverInput.ip !== undefined ||
      serverInput.port !== undefined ||
      serverInput.user !== undefined ||
      serverInput.hostKeyFingerprint !== undefined
    ) {
      sshPool.disconnect(serverId);
    }

    await AuditService.record({
      workspaceId: server.workspaceId,
      action: 'server.updated',
      resourceType: 'server',
      resourceId: server.id,
      resourceName: server.name,
      summary: `Updated server "${server.name}"`,
    });

    return {
      ...server,
      settings: publicSettings(server.settings as unknown as Record<string, unknown> | null),
    };
  },

  /**
   * Server deletion:
   * - Requires exact name confirmation
   * - Blocks if services exist unless deleteResources is true
   * - With deleteResources: best-effort Docker teardown, then hard-delete each service
   * - Then removes the server row (settings/destinations/logs cascade)
   */
  async remove(serverId: string, input: DeleteServerInput) {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, workspaceId: true },
    });
    if (!server) throw new NotFoundError('Server not found.');

    const resources = await this.listResources(serverId);
    const guard = checkServerDelete({
      serverName: server.name,
      confirmName: input.confirmName,
      resourceCount: resources.length,
      deleteResources: input.deleteResources === true,
    });
    if (!guard.ok) {
      if (guard.reason === 'name_mismatch') throw new ValidationError(guard.message);
      throw new ConflictError(guard.message);
    }

    for (const resource of resources) {
      try {
        await teardownService(resource.id);
      } catch (err) {
        console.warn(
          `[server.remove] teardown failed for service ${resource.id} (${resource.name}):`,
          err instanceof Error ? err.message : err,
        );
      }
      await prisma.service.delete({ where: { id: resource.id } });
    }

    sshPool.disconnect(serverId);
    await prisma.server.delete({ where: { id: serverId } });
    await AuditService.record({
      workspaceId: server.workspaceId,
      action: 'server.deleted',
      resourceType: 'server',
      resourceId: server.id,
      resourceName: server.name,
      summary: `Deleted server "${server.name}"`,
    });
  },

  // ---- Destinations ----
  listDestinations(serverId: string) {
    return prisma.dockerDestination.findMany({
      where: { serverId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async createDestination(serverId: string, input: CreateDestinationInput) {
    const destination = await prisma.dockerDestination.create({
      data: {
        serverId,
        name: input.name,
        network: input.network,
        isSwarm: input.isSwarm,
      },
    });
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { workspaceId: true, name: true },
    });
    if (server) {
      await AuditService.record({
        workspaceId: server.workspaceId,
        action: 'server.destination.created',
        resourceType: 'server',
        resourceId: serverId,
        resourceName: server.name,
        summary: `Created destination "${destination.name}"`,
        metadata: { destinationId: destination.id, name: destination.name },
      });
    }
    return destination;
  },

  async destinationServerId(destinationId: string): Promise<string> {
    const dest = await prisma.dockerDestination.findUnique({
      where: { id: destinationId },
      select: { serverId: true },
    });
    if (!dest) throw new NotFoundError('Destination not found.');
    return dest.serverId;
  },

  async removeDestination(destinationId: string) {
    const dest = await prisma.dockerDestination.findUnique({
      where: { id: destinationId },
      select: {
        id: true,
        name: true,
        serverId: true,
        server: { select: { workspaceId: true, name: true } },
      },
    });
    await prisma.dockerDestination.delete({ where: { id: destinationId } });
    if (dest) {
      await AuditService.record({
        workspaceId: dest.server.workspaceId,
        action: 'server.destination.deleted',
        resourceType: 'server',
        resourceId: dest.serverId,
        resourceName: dest.server.name,
        summary: `Deleted destination "${dest.name}"`,
        metadata: { destinationId: dest.id, name: dest.name },
      });
    }
  },
};

async function assertPrivateKeyInWorkspace(workspaceId: string, privateKeyId: string): Promise<void> {
  const key = await prisma.privateKey.findFirst({
    where: { id: privateKeyId, workspaceId },
    select: { id: true },
  });
  if (!key) throw new ValidationError('SSH key not found in this workspace.');
}
