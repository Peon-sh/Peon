import { prisma } from '@/lib/prisma';
import type { ServiceStatus } from '@/lib/prisma';
import { enqueue } from '@/lib/queue/sqs';
import { NotFoundError, AppError, ConflictError } from '@/lib/errors';
import { buildPreviewFqdn } from '@/lib/deploy/preview-fqdn';
import { appendDeploymentLog, type LogLine } from '@/services/internal/deploy/logs';
import { isCancellableStatus } from '@/services/internal/deploy/status';
import type { ServiceControlAction } from '@/lib/service-control';
import {
  assertServerCanAcceptQueuedDeployment,
  promoteServerAfterSlotFreed,
  scheduleQueuedDeployment,
} from '@/services/internal/deploy/server-queue';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';
import { assertNotSuspended, isSuspended } from '@/services/internal/service/suspension';

async function wildcardDomainForService(serviceId: string): Promise<string | null> {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      server: { select: { settings: { select: { wildcardDomain: true } } } },
    },
  });
  return svc?.server?.settings?.wildcardDomain?.trim() || null;
}

function previewUrlForDeployment(opts: {
  isPreview: boolean;
  commitSha: string | null;
  wildcardDomain: string | null;
}): string | null {
  if (!opts.isPreview || !opts.commitSha || !opts.wildcardDomain) return null;
  return buildPreviewFqdn(opts.commitSha, opts.wildcardDomain);
}

const SYSTEM_TRIGGER_LABELS: Record<string, string> = {
  webhook: 'Webhook',
  api: 'API',
};

/** Map stored triggeredBy (userId | webhook | api) to a human-readable label. */
async function resolveTriggeredByLabels(
  triggeredByValues: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const userIds = [
    ...new Set(
      triggeredByValues.filter(
        (v): v is string => !!v && !SYSTEM_TRIGGER_LABELS[v],
      ),
    ),
  ];
  if (!userIds.length) return labels;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  for (const user of users) labels.set(user.id, user.email);
  return labels;
}

function triggeredByLabel(
  raw: string | null | undefined,
  userLabels: Map<string, string>,
): string | null {
  if (!raw) return null;
  if (SYSTEM_TRIGGER_LABELS[raw]) return SYSTEM_TRIGGER_LABELS[raw];
  return userLabels.get(raw) ?? raw;
}

export async function deploy(
  serviceId: string,
  userId: string,
  opts: { force?: boolean; restartOnly?: boolean } = {},
) {
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc) throw new NotFoundError('Service not found.');
  assertNotSuspended(svc, 'deploying');

  if (svc.serverId) {
    await assertServerCanAcceptQueuedDeployment(svc.serverId);
  }

  const deployment = await prisma.deployment.create({
    data: {
      serviceId,
      status: 'QUEUED',
      triggeredBy: userId,
      forceRebuild: opts.force ?? false,
      restartOnly: opts.restartOnly ?? false,
    },
  });

  await scheduleQueuedDeployment({
    deploymentId: deployment.id,
    serviceId,
    serverId: svc.serverId,
    kind: svc.kind,
    force: opts.force,
    restartOnly: opts.restartOnly,
  });
  const action = opts.force
    ? 'service.force_rebuild'
    : opts.restartOnly
      ? 'service.control'
      : 'service.deploy';
  await recordServiceAudit(serviceId, {
    action,
    summary: opts.restartOnly
      ? `Queued restart for "${svc.name}"`
      : opts.force
        ? `Queued force rebuild for "${svc.name}"`
        : `Queued deploy for "${svc.name}"`,
    metadata: { deploymentId: deployment.id, force: !!opts.force, restartOnly: !!opts.restartOnly },
  });
  return deployment;
}

/** Status the API reports back immediately, before the worker reaches the host. */
const INTENT_STATUS: Record<ServiceControlAction, ServiceStatus> = {
  start: 'STARTING',
  restart: 'STARTING',
  resume: 'STARTING',
  stop: 'STOPPED',
  suspend: 'SUSPENDED',
};

const AUDIT_ACTION: Partial<Record<ServiceControlAction, string>> = {
  suspend: 'service.suspended',
  resume: 'service.resumed',
};

export async function control(serviceId: string, action: ServiceControlAction) {
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc) throw new NotFoundError('Service not found.');

  const suspended = isSuspended(svc);
  if (action !== 'suspend' && action !== 'resume') {
    assertNotSuspended(svc, `you can ${action} it`);
  }
  // Idempotent so a double-click cannot re-stamp suspendedAt.
  if (suspended && action === 'suspend') {
    return { queued: false, action, status: 'SUSPENDED' as ServiceStatus };
  }
  if (!suspended && action === 'resume') {
    throw new ConflictError('Service is not suspended.');
  }

  const status = INTENT_STATUS[action];
  // Reflect intent immediately — the worker applies the compose command async.
  // For suspend/resume this also persists the desired state before the job is
  // enqueued, so a git push arriving right after already sees the guard.
  await prisma.service.update({
    where: { id: serviceId },
    data: {
      status,
      ...(action === 'suspend' ? { suspendedAt: new Date() } : {}),
      ...(action === 'resume' ? { suspendedAt: null } : {}),
    },
  });
  await enqueue({ type: 'service.control', serviceId, action });
  await recordServiceAudit(serviceId, {
    action: AUDIT_ACTION[action] ?? 'service.control',
    summary: `Queued ${action} for "${svc.name}"`,
    metadata: { controlAction: action },
  });
  return { queued: true, action, status };
}

export async function rollback(serviceId: string, deploymentId: string, userId: string) {
  const old = await prisma.deployment.findFirst({
    where: { id: deploymentId, serviceId },
  });
  if (!old) throw new NotFoundError('Deployment not found.');
  if (!old.commitSha) throw new AppError('Deployment has no commit to roll back to.');

  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc) throw new NotFoundError('Service not found.');
  assertNotSuspended(svc, 'rolling back');

  if (svc.serverId) {
    await assertServerCanAcceptQueuedDeployment(svc.serverId);
  }

  const deployment = await prisma.deployment.create({
    data: {
      serviceId,
      status: 'QUEUED',
      triggeredBy: userId,
      commitSha: old.commitSha,
      commitMessage: old.commitMessage,
      forceRebuild: true,
    },
  });
  await scheduleQueuedDeployment({
    deploymentId: deployment.id,
    serviceId,
    serverId: svc.serverId,
    kind: svc.kind,
    force: true,
  });
  await recordServiceAudit(serviceId, {
    action: 'service.rollback',
    summary: `Queued rollback for "${svc.name}"`,
    metadata: { deploymentId: deployment.id, toDeploymentId: deploymentId, commitSha: old.commitSha },
  });
  return deployment;
}

export async function listDeployments(serviceId: string) {
  const [rows, wildcardDomain] = await Promise.all([
    prisma.deployment.findMany({
      where: { serviceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        uuid: true,
        status: true,
        commitSha: true,
        commitMessage: true,
        isPreview: true,
        pullRequestId: true,
        forceRebuild: true,
        restartOnly: true,
        triggeredBy: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        previewImagePath: true,
      },
    }),
    wildcardDomainForService(serviceId),
  ]);
  const userLabels = await resolveTriggeredByLabels(rows.map((r) => r.triggeredBy));
  return rows.map(({ previewImagePath, triggeredBy, ...row }) => ({
    ...row,
    triggeredBy: triggeredByLabel(triggeredBy, userLabels),
    hasPreview: !!previewImagePath,
    previewUrl: previewUrlForDeployment({
      isPreview: row.isPreview,
      commitSha: row.commitSha,
      wildcardDomain,
    }),
  }));
}

/** Active (queued / in-progress) deployments across projects the user can access. */
export async function listActiveDeployments(workspaceId: string, projectIds: string[] | 'ALL') {
  if (projectIds !== 'ALL' && projectIds.length === 0) return [];

  const rows = await prisma.deployment.findMany({
    where: {
      status: { in: ['QUEUED', 'IN_PROGRESS'] },
      service: {
        deletedAt: null,
        project:
          projectIds === 'ALL'
            ? { workspaceId }
            : { workspaceId, id: { in: projectIds } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      uuid: true,
      status: true,
      commitSha: true,
      commitMessage: true,
      isPreview: true,
      startedAt: true,
      createdAt: true,
      service: {
        select: {
          id: true,
          name: true,
          projectId: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    uuid: row.uuid,
    status: row.status,
    commitSha: row.commitSha,
    commitMessage: row.commitMessage,
    isPreview: row.isPreview,
    startedAt: row.startedAt,
    createdAt: row.createdAt,
    service: {
      id: row.service.id,
      name: row.service.name,
      projectId: row.service.projectId,
    },
    project: {
      id: row.service.project.id,
      name: row.service.project.name,
    },
  }));
}

export async function getDeployment(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: {
      service: {
        select: {
          id: true,
          name: true,
          projectId: true,
          server: { select: { settings: { select: { wildcardDomain: true } } } },
        },
      },
    },
  });
  if (!deployment) throw new NotFoundError('Deployment not found.');
  const logs = (deployment.logs as unknown as LogLine[] | null) ?? [];
  const userLabels = await resolveTriggeredByLabels([deployment.triggeredBy]);
  const { service, leaseOwner: _leaseOwner, leaseUntil: _leaseUntil, ...rest } = deployment;
  const wildcardDomain = service.server?.settings?.wildcardDomain?.trim() || null;
  return {
    ...rest,
    triggeredBy: triggeredByLabel(deployment.triggeredBy, userLabels),
    logs,
    previewUrl: previewUrlForDeployment({
      isPreview: deployment.isPreview,
      commitSha: deployment.commitSha,
      wildcardDomain,
    }),
    service: {
      id: service.id,
      name: service.name,
      projectId: service.projectId,
    },
  };
}

export async function cancelDeployment(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { service: { select: { serverId: true } } },
  });
  if (!deployment) throw new NotFoundError('Deployment not found.');
  if (!isCancellableStatus(deployment.status)) {
    throw new AppError('Only queued or in-progress deployments can be cancelled.');
  }

  const updated = await prisma.deployment.updateMany({
    where: { id: deploymentId, status: { in: ['QUEUED', 'IN_PROGRESS'] } },
    data: { status: 'CANCELLED', finishedAt: new Date(), leaseOwner: null, leaseUntil: null },
  });
  if (updated.count === 0) {
    throw new AppError('Deployment can no longer be cancelled.');
  }

  await appendDeploymentLog(deploymentId, 'Deployment cancelled by user.', 'system');
  await promoteServerAfterSlotFreed(deployment.service.serverId);
  await recordServiceAudit(deployment.serviceId, {
    action: 'deployment.cancelled',
    resourceType: 'deployment',
    resourceId: deploymentId,
    summary: `Cancelled deployment ${deploymentId}`,
    metadata: { deploymentId },
  });
  return getDeployment(deploymentId);
}
