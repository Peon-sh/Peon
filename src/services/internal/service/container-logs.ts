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

/**
 * Copy `docker logs` into Postgres. Failures are swallowed: losing the archive
 * must not fail a deploy or a server cleanup.
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

  try {
    const res = await sshPool.exec(
      input.target,
      `docker logs --tail ${CONTAINER_LOG_MAX_LINES} --timestamps ${shellSingleQuote(containerName)} 2>&1`,
    );
    if (res.code !== 0) return;
    const content = capContainerLog(res.stdout);
    if (!content) return;

    await prisma.serviceContainerLog.create({
      data: {
        serviceId: input.serviceId,
        deploymentId: input.deploymentId ?? null,
        containerName,
        reason: input.reason,
        content,
      },
    });

    const extras = await prisma.serviceContainerLog.findMany({
      where: { serviceId: input.serviceId },
      orderBy: { capturedAt: 'desc' },
      select: { id: true },
      skip: CONTAINER_LOGS_KEPT,
    });
    if (extras.length) {
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

/** Archive every stopped Peon container on a server before disk cleanup prunes it. */
export async function archiveStoppedServiceContainers(target: SshTarget): Promise<void> {
  try {
    const listed = await sshPool.exec(target, stoppedPeonContainersScript());
    if (listed.code !== 0) return;
    for (const row of parseStoppedContainerInspect(listed.stdout)) {
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

export function listContainerLogArchives(serviceId: string) {
  return prisma.serviceContainerLog.findMany({
    where: { serviceId },
    orderBy: { capturedAt: 'desc' },
    select: {
      id: true,
      containerName: true,
      reason: true,
      capturedAt: true,
      content: true,
    },
  });
}
