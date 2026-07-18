import { prisma } from '@/lib/prisma';
import { ConflictError } from '@/lib/errors';
import { enqueue } from '@/lib/queue/sqs';
import type { ServiceKind } from '@/lib/prisma';
import { availableSlots, shouldRejectQueue } from '@/services/internal/deploy/server-queue-guards';

export { availableSlots, shouldRejectQueue } from '@/services/internal/deploy/server-queue-guards';

const DEFAULT_CONCURRENT_BUILDS = 2;
const DEFAULT_QUEUE_LIMIT = 25;

/** Reject new deploys when waiting (Postgres QUEUED) rows hit the limit. */
export class ServerDeployQueueFullError extends ConflictError {
  constructor(limit: number) {
    super(
      `Deployment queue is full for this server (limit ${limit}). Wait for existing deployments to finish.`,
    );
  }
}

async function serverLimits(serverId: string): Promise<{ concurrentBuilds: number; queueLimit: number }> {
  const settings = await prisma.serverSetting.findUnique({
    where: { serverId },
    select: { concurrentBuilds: true, deploymentQueueLimit: true },
  });
  return {
    concurrentBuilds: settings?.concurrentBuilds ?? DEFAULT_CONCURRENT_BUILDS,
    queueLimit: settings?.deploymentQueueLimit ?? DEFAULT_QUEUE_LIMIT,
  };
}

/** Count deployments for services placed on this server (no Deployment.serverId column). */
export async function countServerDeployments(
  serverId: string,
  status: 'QUEUED' | 'IN_PROGRESS',
): Promise<number> {
  return prisma.deployment.count({
    where: { status, service: { serverId, deletedAt: null } },
  });
}

/**
 * Call before creating a new QUEUED deployment.
 * Rejects when waiting QUEUED count for the server is already at the limit.
 */
export async function assertServerCanAcceptQueuedDeployment(serverId: string): Promise<void> {
  const { queueLimit } = await serverLimits(serverId);
  const queued = await countServerDeployments(serverId, 'QUEUED');
  if (shouldRejectQueue(queued, queueLimit)) {
    throw new ServerDeployQueueFullError(queueLimit);
  }
}

type PromoteCandidate = {
  id: string;
  serviceId: string;
  forceRebuild: boolean;
  restartOnly: boolean;
  kind: ServiceKind;
};

/**
 * Promote the next queued deployment for a server:
 * promote oldest Postgres-only QUEUED rows to SQS while under concurrentBuilds,
 * at most one IN_PROGRESS deployment per service.
 *
 * Marks IN_PROGRESS before enqueue so concurrent counts stay accurate.
 */
export async function tryPromoteServer(serverId: string): Promise<string[]> {
  // Serialize claim per server so concurrent webhook/UI calls cannot
  // overshoot concurrentBuilds (read-count-then-promote race).
  // Enqueue happens after the transaction so SQS is not held inside a DB txn.
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serverId}))`;

    const settings = await tx.serverSetting.findUnique({
      where: { serverId },
      select: { concurrentBuilds: true },
    });
    const concurrentBuilds = settings?.concurrentBuilds ?? DEFAULT_CONCURRENT_BUILDS;

    const inProgressCount = await tx.deployment.count({
      where: { status: 'IN_PROGRESS', service: { serverId, deletedAt: null } },
    });
    let slots = availableSlots(concurrentBuilds, inProgressCount);
    if (slots <= 0) return [] as PromoteCandidate[];

    const inProgressServices = await tx.deployment.findMany({
      where: { status: 'IN_PROGRESS', service: { serverId, deletedAt: null } },
      select: { serviceId: true },
    });
    const busyServices = new Set(inProgressServices.map((d) => d.serviceId));

    const waiting = await tx.deployment.findMany({
      where: { status: 'QUEUED', service: { serverId, deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      take: slots + busyServices.size + 5,
      select: {
        id: true,
        serviceId: true,
        forceRebuild: true,
        restartOnly: true,
        service: { select: { kind: true } },
      },
    });

    const toEnqueue: PromoteCandidate[] = [];

    for (const row of waiting) {
      if (slots <= 0) break;
      if (busyServices.has(row.serviceId)) continue;

      const candidate: PromoteCandidate = {
        id: row.id,
        serviceId: row.serviceId,
        forceRebuild: row.forceRebuild,
        restartOnly: row.restartOnly,
        kind: row.service.kind,
      };

      const updated = await tx.deployment.updateMany({
        where: { id: candidate.id, status: 'QUEUED' },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
      if (updated.count === 0) continue;

      toEnqueue.push(candidate);
      busyServices.add(candidate.serviceId);
      slots -= 1;
    }

    return toEnqueue;
  });

  const promoted: string[] = [];
  for (const candidate of claimed) {
    try {
      await enqueue(
        candidate.kind === 'DATABASE'
          ? {
              type: 'database.provision',
              deploymentId: candidate.id,
              serviceId: candidate.serviceId,
            }
          : {
              type: 'deploy',
              deploymentId: candidate.id,
              serviceId: candidate.serviceId,
              force: candidate.forceRebuild,
              restartOnly: candidate.restartOnly,
            },
      );
      promoted.push(candidate.id);
    } catch (err) {
      await prisma.deployment.updateMany({
        where: { id: candidate.id, status: 'IN_PROGRESS' },
        data: { status: 'QUEUED', startedAt: null },
      });
      throw err;
    }
  }

  return promoted;
}

/**
 * After a deployment row exists as QUEUED:
 * - no server → enqueue immediately (worker will claim QUEUED → IN_PROGRESS)
 * - with server → tryPromoteServer (may stay Postgres-only QUEUED)
 */
export async function scheduleQueuedDeployment(opts: {
  deploymentId: string;
  serviceId: string;
  serverId: string | null;
  kind: ServiceKind;
  force?: boolean;
  restartOnly?: boolean;
}): Promise<'enqueued' | 'waiting'> {
  if (!opts.serverId) {
    await enqueue(
      opts.kind === 'DATABASE'
        ? {
            type: 'database.provision',
            deploymentId: opts.deploymentId,
            serviceId: opts.serviceId,
          }
        : {
            type: 'deploy',
            deploymentId: opts.deploymentId,
            serviceId: opts.serviceId,
            force: opts.force,
            restartOnly: opts.restartOnly,
          },
    );
    return 'enqueued';
  }

  const promoted = await tryPromoteServer(opts.serverId);
  return promoted.includes(opts.deploymentId) ? 'enqueued' : 'waiting';
}

/** Best-effort promotion after a deploy slot frees on a server. */
export async function promoteServerAfterSlotFreed(serverId: string | null | undefined): Promise<void> {
  if (!serverId) return;
  try {
    await tryPromoteServer(serverId);
  } catch (err) {
    console.warn(
      `[server-queue] promote failed for server ${serverId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
