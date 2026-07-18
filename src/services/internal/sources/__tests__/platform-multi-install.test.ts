import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    githubApp: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/github/app', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github/app')>('@/lib/github/app');
  return {
    ...actual,
    fetchGithubInstallationAccount: vi.fn(),
    resolveGithubAuth: vi.fn((app) => app),
  };
});

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    ...actual,
    isPlatformGithubConfigured: vi.fn(() => true),
    serverEnv: vi.fn(() => ({
      GITHUB_APP_ID: '4264638',
      GITHUB_APP_SLUG: 'peon-sh',
      GITHUB_APP_CLIENT_ID: 'client',
      GITHUB_APP_WEBHOOK_SECRET: 'whsec',
      GITHUB_APP_PRIVATE_KEY: 'pem',
      JWT_SECRET: 'test-secret-at-least-16-chars',
    })),
  };
});

import { prisma } from '@/lib/prisma';
import { fetchGithubInstallationAccount } from '@/lib/github/app';
import { signGithubConnectState } from '@/lib/github/connect-state';
import { SourceService } from '../sources';

describe('completePlatformConnect multi-install', () => {
  const workspaceId = 'ws-1';
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
    vi.mocked(fetchGithubInstallationAccount).mockResolvedValue({ login: 'acme', type: 'Organization' });
  });

  function state() {
    return signGithubConnectState({ workspaceId, userId });
  }

  it('creates a PLATFORM row for a new installation without touching others', async () => {
    vi.mocked(prisma.githubApp.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.githubApp.create).mockResolvedValue({
      id: 'src-new',
      workspaceId,
      kind: 'PLATFORM',
      installationId: '111',
      name: 'GitHub (Peon): acme',
      organization: 'acme',
    } as never);

    const result = await SourceService.completePlatformConnect({
      state: state(),
      installationId: '111',
      setupAction: 'install',
      sessionUserId: userId,
    });

    expect(prisma.githubApp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId,
          installationId: '111',
          kind: 'PLATFORM',
          organization: 'acme',
          accountType: 'Organization',
          name: 'GitHub (Peon): acme',
          htmlUrl: 'https://github.com',
        }),
      }),
    );
    expect(prisma.githubApp.update).not.toHaveBeenCalled();
    expect(result.app.installationId).toBe('111');
  });

  it('stores User accountType for personal installs', async () => {
    vi.mocked(fetchGithubInstallationAccount).mockResolvedValue({ login: 'hironate', type: 'User' });
    vi.mocked(prisma.githubApp.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.githubApp.create).mockResolvedValue({
      id: 'src-user',
      workspaceId,
      kind: 'PLATFORM',
      installationId: '146934374',
      organization: 'hironate',
      accountType: 'User',
    } as never);

    await SourceService.completePlatformConnect({
      state: state(),
      installationId: '146934374',
      setupAction: 'install',
      sessionUserId: userId,
    });

    expect(prisma.githubApp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization: 'hironate',
          accountType: 'User',
          htmlUrl: 'https://github.com',
        }),
      }),
    );
  });

  it('updates the same installationId only on reconnect', async () => {
    vi.mocked(prisma.githubApp.findFirst).mockResolvedValue({
      id: 'src-1',
      workspaceId,
      kind: 'PLATFORM',
      name: 'GitHub (Peon): acme',
      organization: 'acme',
    } as never);
    vi.mocked(prisma.githubApp.update).mockResolvedValue({
      id: 'src-1',
      workspaceId,
      installationId: '111',
      kind: 'PLATFORM',
      name: 'GitHub (Peon): acme',
      organization: 'acme',
    } as never);

    await SourceService.completePlatformConnect({
      state: state(),
      installationId: '111',
      setupAction: 'update',
      sessionUserId: userId,
    });

    expect(prisma.githubApp.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'src-1' },
        data: expect.objectContaining({ installationId: '111', status: 'CONNECTED' }),
      }),
    );
    expect(prisma.githubApp.create).not.toHaveBeenCalled();
  });

  it('creates a workspace-local PLATFORM row when installation exists in another workspace', async () => {
    vi.mocked(prisma.githubApp.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.githubApp.create).mockResolvedValue({
      id: 'src-new',
      workspaceId,
      installationId: '999',
      kind: 'PLATFORM',
      name: 'GitHub (Peon): acme',
      organization: 'acme',
    } as never);

    const result = await SourceService.completePlatformConnect({
      state: state(),
      installationId: '999',
      setupAction: 'install',
      sessionUserId: userId,
    });

    expect(prisma.githubApp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId,
          installationId: '999',
          kind: 'PLATFORM',
        }),
      }),
    );
    expect(prisma.githubApp.update).not.toHaveBeenCalled();
    expect(result.app.installationId).toBe('999');
  });

  it('rejects setup_action=request (pending org approval)', async () => {
    await expect(
      SourceService.completePlatformConnect({
        state: state(),
        installationId: '111',
        setupAction: 'request',
        sessionUserId: userId,
      }),
    ).rejects.toMatchObject({ code: 'GITHUB_INSTALL_REQUESTED' });
  });
});

describe('setInstallationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.githubApp.updateMany).mockResolvedValue({ count: 1 });
  });

  it('scopes lifecycle updates to the installation id and refreshes org name', async () => {
    await SourceService.setInstallationStatus('145', 'DISCONNECTED', 'acme');
    expect(prisma.githubApp.updateMany).toHaveBeenCalledWith({
      where: { installationId: '145' },
      data: {
        status: 'DISCONNECTED',
        organization: 'acme',
        name: 'GitHub (Peon): acme',
      },
    });
  });

  it('does not overwrite name when organization is omitted', async () => {
    await SourceService.setInstallationStatus('145', 'SUSPENDED');
    expect(prisma.githubApp.updateMany).toHaveBeenCalledWith({
      where: { installationId: '145' },
      data: { status: 'SUSPENDED' },
    });
  });
});
