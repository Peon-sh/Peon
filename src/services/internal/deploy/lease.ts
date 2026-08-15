import { prisma } from '@/lib/prisma';
import { startIntervalHeartbeat } from '@/lib/queue/visibility-heartbeat';

/** How long a worker holds exclusive rights to run a deployment. */
export const DEPLOY_LEASE_MS = 120_000;

/** Renew well before expiry so a brief DB hiccup does not drop the lease. */
export const DEPLOY_LEASE_RENEW_MS = 30_000;

export function isDeployLeaseExpired(leaseUntil: Date | null | undefined, now: Date): boolean {
  return leaseUntil == null || leaseUntil.getTime() < now.getTime();
}

/**
 * Claim exclusive execution of an IN_PROGRESS deployment.
 * Succeeds when no lease is held, or the previous worker's lease has expired
 * (crash / lost SQS heartbeat). Concurrent claimants: at most one wins.
 */
export async function tryAcquireDeployLease(
  deploymentId: string,
  owner: string,
  now = new Date(),
  leaseMs = DEPLOY_LEASE_MS,
): Promise<boolean> {
  const updated = await prisma.deployment.updateMany({
    where: {
      id: deploymentId,
      status: 'IN_PROGRESS',
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  return updated.count === 1;
}

export async function renewDeployLease(
  deploymentId: string,
  owner: string,
  now = new Date(),
  leaseMs = DEPLOY_LEASE_MS,
): Promise<boolean> {
  const updated = await prisma.deployment.updateMany({
    where: { id: deploymentId, leaseOwner: owner, status: 'IN_PROGRESS' },
    data: { leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  return updated.count === 1;
}

export async function releaseDeployLease(deploymentId: string, owner: string): Promise<void> {
  await prisma.deployment.updateMany({
    where: { id: deploymentId, leaseOwner: owner },
    data: { leaseOwner: null, leaseUntil: null },
  });
}

export function startDeployLeaseHeartbeat(
  deploymentId: string,
  owner: string,
  log?: (message: string) => void,
): { stop: () => void } {
  return startIntervalHeartbeat(
    async () => {
      const ok = await renewDeployLease(deploymentId, owner);
      if (!ok) {
        throw new Error('deploy lease lost (cancelled or taken over)');
      }
    },
    DEPLOY_LEASE_RENEW_MS,
    { log, stopOnError: true },
  );
}
