import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    service: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    s3Storage: { findUnique: vi.fn() },
    privateKey: { findUnique: vi.fn() },
    githubApp: { findUnique: vi.fn() },
    gitlabApp: { findUnique: vi.fn() },
    dockerDestination: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  assertBindingsInWorkspace,
  assertProjectInWorkspace,
  assertStorageInWorkspace,
  workspaceIdForProject,
  workspaceIdForService,
} from '../workspace-resources';

describe('workspace resource tenancy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves project and service workspace ids', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ workspaceId: 'ws-a' } as never);
    vi.mocked(prisma.service.findUnique).mockResolvedValue({
      project: { workspaceId: 'ws-a' },
    } as never);

    await expect(workspaceIdForProject('p1')).resolves.toBe('ws-a');
    await expect(workspaceIdForService('s1')).resolves.toBe('ws-a');
  });

  it('rejects a project from another workspace', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ workspaceId: 'ws-b' } as never);
    await expect(assertProjectInWorkspace('p1', 'ws-a')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a storage id from another workspace', async () => {
    vi.mocked(prisma.s3Storage.findUnique).mockResolvedValue({ workspaceId: 'ws-b' } as never);
    await expect(assertStorageInWorkspace('st-1', 'ws-a')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('404s when the storage id does not exist', async () => {
    vi.mocked(prisma.s3Storage.findUnique).mockResolvedValue(null);
    await expect(assertStorageInWorkspace('missing', 'ws-a')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects binding a server from another workspace', async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({ workspaceId: 'ws-b' } as never);
    await expect(
      assertBindingsInWorkspace('ws-a', { serverId: 'srv-b' }),
    ).rejects.toThrow(/another workspace/);
  });

  it('rejects a destination that belongs to a different server', async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({ workspaceId: 'ws-a' } as never);
    vi.mocked(prisma.dockerDestination.findUnique).mockResolvedValue({
      serverId: 'srv-other',
      server: { workspaceId: 'ws-a' },
    } as never);

    await expect(
      assertBindingsInWorkspace('ws-a', { serverId: 'srv-a', destinationId: 'dst-1' }),
    ).rejects.toThrow(/not on the server you selected/);
  });

  it('uses the existing server when destination is updated alone', async () => {
    vi.mocked(prisma.dockerDestination.findUnique).mockResolvedValue({
      serverId: 'srv-a',
      server: { workspaceId: 'ws-a' },
    } as never);

    await expect(
      assertBindingsInWorkspace('ws-a', { destinationId: 'dst-1' }, { existingServerId: 'srv-a' }),
    ).resolves.toBeUndefined();
  });

  it('allows same-workspace bindings', async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({ workspaceId: 'ws-a' } as never);
    vi.mocked(prisma.githubApp.findUnique).mockResolvedValue({ workspaceId: 'ws-a' } as never);
    vi.mocked(prisma.privateKey.findUnique).mockResolvedValue({ workspaceId: 'ws-a' } as never);
    vi.mocked(prisma.dockerDestination.findUnique).mockResolvedValue({
      serverId: 'srv-a',
      server: { workspaceId: 'ws-a' },
    } as never);

    await expect(
      assertBindingsInWorkspace('ws-a', {
        serverId: 'srv-a',
        githubAppId: 'gh-1',
        privateKeyId: 'key-1',
        destinationId: 'dst-1',
      }),
    ).resolves.toBeUndefined();
  });
});
