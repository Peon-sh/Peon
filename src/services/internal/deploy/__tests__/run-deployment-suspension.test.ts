import { beforeEach, describe, expect, it, vi } from 'vitest';

// runDeployment reaches the host through ssh and the docker helpers; the
// suspension guard runs before any of that, so they only need to exist.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    deployment: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    service: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec: vi.fn(), execStream: vi.fn(), putContent: vi.fn() },
  sshTargetForServer: vi.fn(),
}));

vi.mock('@/services/internal/deploy/logs', () => ({
  makeDeploymentLogger: () => ({
    info: vi.fn().mockResolvedValue(undefined),
    stdout: vi.fn().mockResolvedValue(undefined),
    stderr: vi.fn().mockResolvedValue(undefined),
  }),
  appendDeploymentLog: vi.fn(),
}));

vi.mock('@/services/internal/deploy/server-queue', () => ({
  promoteServerAfterSlotFreed: vi.fn(),
}));

vi.mock('@/services/internal/deploy/lease', () => ({
  releaseDeployLease: vi.fn(),
  startDeployLeaseHeartbeat: vi.fn(() => ({ stop: vi.fn() })),
  tryAcquireDeployLease: vi.fn().mockResolvedValue(true),
}));

import { prisma } from '@/lib/prisma';
import { promoteServerAfterSlotFreed } from '@/services/internal/deploy/server-queue';
import { tryAcquireDeployLease } from '@/services/internal/deploy/lease';
import { runDeployment } from '@/services/internal/deploy/engine';

const deploymentFindUnique = vi.mocked(prisma.deployment.findUnique);
const deploymentUpdateMany = vi.mocked(prisma.deployment.updateMany);
const serviceFindUnique = vi.mocked(prisma.service.findUnique);

function queuedDeployment() {
  return { id: 'dep1', serviceId: 'svc1', status: 'QUEUED' } as never;
}

function service(suspendedAt: Date | null) {
  return {
    id: 'svc1',
    name: 'app',
    uuid: 'uuid-1',
    serverId: 'srv1',
    kind: 'GIT_APP',
    suspendedAt,
    settings: null,
    privateKey: null,
    githubApp: null,
    project: { id: 'proj1', name: 'proj' },
  } as never;
}

describe('runDeployment suspension re-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deploymentFindUnique.mockResolvedValue(queuedDeployment());
    deploymentUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  // A deployment can sit in the server queue while the operator suspends the
  // service. The creation-time guards already ran, so this entry check is the
  // only thing standing between a queued job and a service scaled to zero.
  it('cancels a queued deployment whose service was suspended after enqueue', async () => {
    serviceFindUnique.mockResolvedValue(service(new Date('2026-01-01T00:00:00Z')));

    await runDeployment('dep1');

    // Cancelled rather than run, and only while still queued/in-progress so a
    // finished deployment cannot be rewritten.
    expect(deploymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'dep1', status: { in: ['QUEUED', 'IN_PROGRESS'] } },
      data: { status: 'CANCELLED', finishedAt: expect.any(Date) },
    });
    // The queue slot this deployment may already hold has to be handed back,
    // otherwise the server stays one build short until a restart.
    expect(promoteServerAfterSlotFreed).toHaveBeenCalledWith('srv1');
    // Nothing past the guard ran: no claim, no host work.
    expect(tryAcquireDeployLease).not.toHaveBeenCalled();
  });

  it('claims the deployment when the service is not suspended', async () => {
    serviceFindUnique.mockResolvedValue(service(null));

    // The deploy proceeds past the guard and fails later on unmocked host work;
    // what matters is that it claimed instead of cancelling.
    await runDeployment('dep1').catch(() => undefined);

    expect(deploymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'dep1', status: 'QUEUED' },
      data: { status: 'IN_PROGRESS', startedAt: expect.any(Date) },
    });
    expect(deploymentUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });
});
