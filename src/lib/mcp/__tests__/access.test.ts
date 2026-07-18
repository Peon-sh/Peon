import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenError } from '@/lib/errors';
import type { User } from '@/lib/prisma';

vi.mock('@/lib/auth/access', () => ({
  workspaceContextFor: vi.fn(),
  projectAccessFor: vi.fn(),
  canManageInfrastructure: (role: string) => role === 'OWNER' || role === 'ADMIN',
  roleAtLeast: (role: string, min: string) => {
    const rank: Record<string, number> = { OWNER: 4, ADMIN: 3, BILLING_ADMIN: 2, MEMBER: 1 };
    return rank[role] >= rank[min];
  },
}));

vi.mock('@/services/internal/service/service', () => ({
  ServiceModule: {
    projectIdFor: vi.fn(),
  },
}));

vi.mock('@/services/internal/server/server', () => ({
  ServerService: {
    workspaceIdFor: vi.fn(),
  },
}));

vi.mock('@/services/internal/sources/sources', () => ({
  SourceService: {
    resolve: vi.fn(),
  },
}));

vi.mock('@/services/internal/storages/storages', () => ({
  StorageService: {
    workspaceIdFor: vi.fn(),
  },
}));

vi.mock('@/services/internal/privatekey/privatekey', () => ({
  PrivateKeyService: {
    workspaceIdFor: vi.fn(),
  },
}));

vi.mock('@/services/internal/shared-variables/shared-variables', () => ({
  SharedVariableService: {
    workspaceIdFor: vi.fn(),
  },
}));

vi.mock('@/services/internal/tags/tags', () => ({
  TagService: {
    workspaceIdFor: vi.fn(),
  },
}));

import { workspaceContextFor, projectAccessFor } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { ServerService } from '@/services/internal/server/server';
import { createMcpAccess } from '../access';

const user = { id: 'u1', email: 'a@b.com', name: 'A' } as User;
const ctx = { user, workspaceId: 'ws-token' };

describe('createMcpAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects project access when project is in another workspace', async () => {
    vi.mocked(projectAccessFor).mockResolvedValue({
      user,
      workspaceId: 'ws-other',
      role: 'ADMIN',
      projectId: 'p1',
      canManage: true,
    });
    const access = createMcpAccess(ctx);
    await expect(access.projectAccess('p1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects manage when canManage is false', async () => {
    vi.mocked(projectAccessFor).mockResolvedValue({
      user,
      workspaceId: 'ws-token',
      role: 'MEMBER',
      projectId: 'p1',
      canManage: false,
    });
    const access = createMcpAccess(ctx);
    await expect(access.projectAccess('p1')).resolves.toMatchObject({ projectId: 'p1' });
    await expect(access.projectAccess('p1', true)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('resolves service access via project', async () => {
    vi.mocked(ServiceModule.projectIdFor).mockResolvedValue('p1');
    vi.mocked(projectAccessFor).mockResolvedValue({
      user,
      workspaceId: 'ws-token',
      role: 'ADMIN',
      projectId: 'p1',
      canManage: true,
    });
    const access = createMcpAccess(ctx);
    await expect(access.serviceAccess('svc1', true)).resolves.toMatchObject({ projectId: 'p1' });
    expect(ServiceModule.projectIdFor).toHaveBeenCalledWith('svc1');
  });

  it('rejects infra for MEMBER role', async () => {
    vi.mocked(workspaceContextFor).mockResolvedValue({
      user,
      workspaceId: 'ws-token',
      role: 'MEMBER',
    });
    const access = createMcpAccess(ctx);
    await expect(access.infra()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows infra for ADMIN', async () => {
    vi.mocked(workspaceContextFor).mockResolvedValue({
      user,
      workspaceId: 'ws-token',
      role: 'ADMIN',
    });
    const access = createMcpAccess(ctx);
    await expect(access.infra()).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('rejects server from another workspace', async () => {
    vi.mocked(ServerService.workspaceIdFor).mockResolvedValue('ws-other');
    const access = createMcpAccess(ctx);
    await expect(access.assertServerInWorkspace('s1')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
