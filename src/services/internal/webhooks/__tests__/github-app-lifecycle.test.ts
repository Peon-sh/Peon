import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    githubApp: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    deployment: {
      create: vi.fn(),
    },
    workspaceAuditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/services/internal/deploy/server-queue', () => ({
  assertServerCanAcceptQueuedDeployment: vi.fn(),
  scheduleQueuedDeployment: vi.fn(),
  ServerDeployQueueFullError: class extends Error {},
}));

vi.mock('@/services/internal/billing/billing', () => ({
  BillingService: {
    assertProjectWritable: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    ...actual,
    isPlatformGithubConfigured: vi.fn(() => true),
    serverEnv: vi.fn(() => ({
      GITHUB_APP_ID: '4284838',
      GITHUB_APP_SLUG: 'peon',
      GITHUB_APP_WEBHOOK_SECRET: 'platform-secret',
      GITHUB_APP_PRIVATE_KEY: 'pem',
    })),
  };
});

import { prisma } from '@/lib/prisma';
import {
  assertServerCanAcceptQueuedDeployment,
  scheduleQueuedDeployment,
} from '@/services/internal/deploy/server-queue';
import { BillingService } from '@/services/internal/billing/billing';
import { handleGithubAppEvents } from '@/services/internal/webhooks/github-app';
import { SourceService } from '@/services/internal/sources/sources';

describe('github app installation webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.githubApp.findMany).mockResolvedValue([]);
    vi.mocked(prisma.githubApp.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ workspaceId: 'ws1' } as never);
    vi.mocked(BillingService.assertProjectWritable).mockResolvedValue(undefined);
    vi.mocked(prisma.service.findUnique).mockImplementation(async ({ where }) =>
      ({
        id: where.id,
        name: where.id === 'svc-worker' ? 'worker' : 'webapp',
        project: { workspaceId: 'ws1' },
      }) as never,
    );
    vi.mocked(prisma.workspaceAuditLog.create).mockResolvedValue({} as never);
  });

  it('queues push deploys through server concurrentBuilds gate', async () => {
    vi.mocked(prisma.githubApp.findMany).mockResolvedValue([
      {
        id: 'app1',
        webhookSecret: null,
        installationId: '1',
        appId: '4284838',
      } as never,
    ]);
    vi.mocked(prisma.service.findMany).mockResolvedValue([
      {
        id: 'svc-web',
        name: 'webapp',
        kind: 'APPLICATION',
        projectId: 'proj1',
        serverId: 'srv1',
        settings: { isAutoDeployEnabled: true, watchPaths: null },
      },
      {
        id: 'svc-worker',
        name: 'worker',
        kind: 'APPLICATION',
        projectId: 'proj1',
        serverId: 'srv1',
        settings: { isAutoDeployEnabled: true, watchPaths: null },
      },
    ] as never);
    vi.mocked(prisma.deployment.create)
      .mockResolvedValueOnce({ id: 'dep1' } as never)
      .mockResolvedValueOnce({ id: 'dep2' } as never);
    vi.mocked(assertServerCanAcceptQueuedDeployment).mockResolvedValue(undefined);
    vi.mocked(scheduleQueuedDeployment).mockResolvedValue('waiting');

    const body = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'abc123',
      head_commit: { message: 'ship it', id: 'abc123' },
      repository: { id: 99, full_name: 'Peon-sh/Peon' },
      installation: { id: 1 },
    });
    const signature =
      'sha256=' + createHmac('sha256', 'platform-secret').update(body).digest('hex');

    const result = await handleGithubAppEvents({
      rawBody: body,
      event: 'push',
      signature,
      installationTargetId: '4284838',
    });

    expect(result.triggered).toBe(true);
    expect(BillingService.assertProjectWritable).toHaveBeenCalledWith('ws1');
    expect(assertServerCanAcceptQueuedDeployment).toHaveBeenCalledTimes(2);
    expect(scheduleQueuedDeployment).toHaveBeenCalledTimes(2);
    expect(scheduleQueuedDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'dep1',
        serviceId: 'svc-web',
        serverId: 'srv1',
      }),
    );
  });

  it('marks platform installs disconnected on installation.deleted', async () => {
    const setStatus = vi.spyOn(SourceService, 'setInstallationStatus').mockResolvedValue();
    const body = JSON.stringify({
      action: 'deleted',
      installation: { id: 145665844, account: { login: 'acme' } },
    });
    const signature =
      'sha256=' + createHmac('sha256', 'platform-secret').update(body).digest('hex');

    const result = await handleGithubAppEvents({
      rawBody: body,
      event: 'installation',
      signature,
      installationTargetId: '4284838',
    });

    expect(result.reason).toMatch(/disconnected/);
    expect(setStatus).toHaveBeenCalledWith('145665844', 'DISCONNECTED', 'acme', null);
  });

  it('acks installation_repositories without DB writes', async () => {
    const setStatus = vi.spyOn(SourceService, 'setInstallationStatus').mockResolvedValue();
    const body = JSON.stringify({ action: 'added', repositories_added: [] });
    const signature =
      'sha256=' + createHmac('sha256', 'platform-secret').update(body).digest('hex');

    const result = await handleGithubAppEvents({
      rawBody: body,
      event: 'installation_repositories',
      signature,
      installationTargetId: '4284838',
    });

    expect(result.reason).toMatch(/installation_repositories/);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('rejects ping with invalid signature', async () => {
    await expect(
      handleGithubAppEvents({
        rawBody: '{"zen":"x"}',
        event: 'ping',
        signature: 'sha256=deadbeef',
        installationTargetId: '4284838',
      }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });
});
