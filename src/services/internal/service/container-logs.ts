import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { sshPool, type SshTarget } from '@/lib/ssh';
import { shellSingleQuote } from '@/lib/shell/quote';
import { PEON_SERVICE_ID_LABEL } from '@/lib/deploy/rolling';
import {
  capContainerLog,
  CONTAINER_LOG_MAX_LINES,
  CONTAINER_LOGS_KEPT,
  parseStoppedContainerInspect,
  type ContainerLogReason,
} from '@/lib/container-log-text';
import { PlatformS3Keys } from '@/services/external/s3/keys';
import {
  deletePlatformObject,
  getPlatformObject,
  isPlatformS3Configured,
  uploadPlatformObject,
} from '@/services/external/s3/assets';

/**
 * Copy `docker logs` to a private S3 object. The database row stores only the
 * object key. Failures are swallowed: losing the archive must not fail a
 * deploy or a server cleanup.
 */
export async function archiveContainerLogs(input: {
  target: SshTarget;
  serviceId: string;
  containerName: string;
  deploymentId?: string | null;
  reason: ContainerLogReason;
}): Promise<void> {
  const containerName = input.containerName.trim();
  if (!containerName) return;
  if (!isPlatformS3Configured()) {
    console.warn('[container-logs] skipped archive: S3_BUCKET is not configured.');
    return;
  }

  try {
    const res = await sshPool.exec(
      input.target,
      `docker logs --tail ${CONTAINER_LOG_MAX_LINES} --timestamps ${shellSingleQuote(containerName)} 2>&1`,
    );
    if (res.code !== 0) return;
    const content = capContainerLog(res.stdout);
    if (!content) return;

    const id = randomUUID();
    const objectKey = PlatformS3Keys.containerLog(input.serviceId, id);
    await uploadPlatformObject({
      key: objectKey,
      body: Buffer.from(content, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
      cacheControl: 'private, no-store',
    });

    try {
      await prisma.serviceContainerLog.create({
        data: {
          id,
          serviceId: input.serviceId,
          deploymentId: input.deploymentId ?? null,
          containerName,
          reason: input.reason,
          objectKey,
        },
      });
    } catch (err) {
      await deletePlatformObject(objectKey).catch(() => undefined);
      throw err;
    }

    const extras = await prisma.serviceContainerLog.findMany({
      where: { serviceId: input.serviceId },
      orderBy: { capturedAt: 'desc' },
      select: { id: true, objectKey: true },
      skip: CONTAINER_LOGS_KEPT,
    });
    if (extras.length) {
      await Promise.all(extras.map((row) => deletePlatformObject(row.objectKey).catch(() => undefined)));
      await prisma.serviceContainerLog.deleteMany({
        where: { id: { in: extras.map((row) => row.id) } },
      });
    }
  } catch (err) {
    console.error(
      '[container-logs] archive failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

/** Stopped Peon containers `docker container prune` is about to delete. */
export function stoppedPeonContainersScript(): string {
  const label = PEON_SERVICE_ID_LABEL;
  return [
    'ids=$(',
    `  docker ps -aq --filter status=created --filter label=${label}`,
    `  docker ps -aq --filter status=exited --filter label=${label}`,
    `  docker ps -aq --filter status=dead --filter label=${label}`,
    ')',
    'printf \'%s\\n\' "$ids" | sort -u | while read -r id; do',
    '  [ -n "$id" ] || continue',
    `  docker inspect --format '{{.Name}}|{{index .Config.Labels "${label}"}}' "$id" 2>/dev/null || true`,
    'done',
  ].join('\n');
}

function asContainerLogReason(value: string): ContainerLogReason {
  if (value === 'rolling' || value === 'cleanup' || value === 'deploy') return value;
  return 'deploy';
}

/**
 * Archive stopped Peon containers on this server before disk cleanup prunes them.
 * A container label is not proof of ownership: only services placed on `serverId`
 * are archived, so a foreign label cannot fill another service's archive slots.
 */
export async function archiveStoppedServiceContainers(
  target: SshTarget,
  serverId: string,
): Promise<void> {
  try {
    const services = await prisma.service.findMany({
      where: { serverId, deletedAt: null },
      select: { id: true },
    });
    const owned = new Set(services.map((service) => service.id));
    const listed = await sshPool.exec(target, stoppedPeonContainersScript());
    if (listed.code !== 0) return;
    for (const row of parseStoppedContainerInspect(listed.stdout)) {
      if (!owned.has(row.serviceId)) continue;
      await archiveContainerLogs({
        target,
        serviceId: row.serviceId,
        containerName: row.containerName,
        reason: 'cleanup',
      });
    }
  } catch (err) {
    console.error(
      '[container-logs] cleanup archive failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

/** Remove archived objects before the service row cascade-deletes the pointers. */
export async function deleteArchivedContainerLogs(serviceId: string): Promise<void> {
  try {
    const rows = await prisma.serviceContainerLog.findMany({
      where: { serviceId },
      select: { objectKey: true },
    });
    await Promise.all(rows.map((row) => deletePlatformObject(row.objectKey).catch(() => undefined)));
  } catch (err) {
    console.error(
      '[container-logs] delete archives failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

export async function listContainerLogArchives(serviceId: string) {
  const rows = await prisma.serviceContainerLog.findMany({
    where: { serviceId },
    orderBy: { capturedAt: 'desc' },
    select: {
      id: true,
      containerName: true,
      reason: true,
      capturedAt: true,
      objectKey: true,
    },
  });

  const loaded = await Promise.all(
    rows.map(async (row) => {
      try {
        const body = await getPlatformObject(row.objectKey);
        return {
          id: row.id,
          containerName: row.containerName,
          reason: asContainerLogReason(row.reason),
          capturedAt: row.capturedAt,
          content: body.toString('utf8'),
        };
      } catch (err) {
        console.error(
          '[container-logs] read archive failed:',
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    }),
  );
  return loaded.filter((row) => row !== null);
}
