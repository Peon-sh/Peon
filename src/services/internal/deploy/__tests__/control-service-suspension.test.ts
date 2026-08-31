import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec: vi.fn() },
  sshTargetForServer: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { sshPool, sshTargetForServer } from '@/lib/ssh';
import { controlService } from '@/services/internal/deploy/engine';

const serviceFindUnique = vi.mocked(prisma.service.findUnique);
const serviceUpdate = vi.mocked(prisma.service.update);
const serviceUpdateMany = vi.mocked(prisma.service.updateMany);
const exec = vi.mocked(sshPool.exec);
const targetForServer = vi.mocked(sshTargetForServer);

function service(suspendedAt: Date | null) {
  return {
    id: 'svc1',
    name: 'app',
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    serverId: 'srv1',
    suspendedAt,
  } as never;
}

describe('controlService suspension re-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    targetForServer.mockResolvedValue({ host: 'h', user: 'u' } as never);
    exec.mockResolvedValue({ code: 0, stdout: '', stderr: '' } as never);
    serviceUpdate.mockResolvedValue({} as never);
    serviceUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  // Resume clears suspendedAt at enqueue time. If the operator suspends again
  // before the worker runs, a stale resume must not compose-up or flip status.
  it('skips a stale resume when the service was re-suspended', async () => {
    serviceFindUnique.mockResolvedValue(service(new Date('2026-01-01T00:00:00Z')));

    await controlService('svc1', 'resume');

    expect(exec).not.toHaveBeenCalled();
    expect(serviceUpdate).not.toHaveBeenCalled();
  });

  it('skips a stale start when the service was suspended after enqueue', async () => {
    serviceFindUnique.mockResolvedValue(service(new Date('2026-01-01T00:00:00Z')));

    await controlService('svc1', 'start');

    expect(exec).not.toHaveBeenCalled();
    expect(serviceUpdate).not.toHaveBeenCalled();
  });

  it('skips a stale restart when the service is suspended', async () => {
    serviceFindUnique.mockResolvedValue(service(new Date('2026-01-01T00:00:00Z')));

    await controlService('svc1', 'restart');

    expect(exec).not.toHaveBeenCalled();
    expect(serviceUpdate).not.toHaveBeenCalled();
  });

  it('still applies suspend while suspended (idempotent host stop)', async () => {
    serviceFindUnique.mockResolvedValue(service(new Date('2026-01-01T00:00:00Z')));

    await controlService('svc1', 'suspend');

    expect(exec).toHaveBeenCalled();
    expect(serviceUpdate).toHaveBeenCalledWith({
      where: { id: 'svc1' },
      data: { status: 'SUSPENDED' },
    });
  });

  it('applies resume when suspension was cleared', async () => {
    serviceFindUnique.mockResolvedValue(service(null));

    await controlService('svc1', 'resume');

    expect(exec).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^cd '[^']+' && docker compose up -d$/),
    );
    expect(serviceUpdate).toHaveBeenCalledWith({
      where: { id: 'svc1' },
      data: { status: 'RUNNING' },
    });
  });

  it('shell-quotes the service directory on the host command', async () => {
    serviceFindUnique.mockResolvedValue(service(null));

    await controlService('svc1', 'stop');

    const cmd = exec.mock.calls[0]?.[1] as string;
    expect(cmd).toMatch(
      /^cd '\/data\/peon\/services\/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' && /,
    );
  });

  it('keeps SUSPENDED when a stale stop runs after suspension', async () => {
    serviceFindUnique.mockResolvedValue(service(new Date('2026-01-01T00:00:00Z')));
    serviceUpdateMany
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 1 } as never);

    await controlService('svc1', 'stop');

    expect(serviceUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'svc1', suspendedAt: null },
      data: { status: 'STOPPED' },
    });
    expect(serviceUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'svc1', suspendedAt: { not: null } },
      data: { status: 'SUSPENDED' },
    });
    expect(serviceUpdate).not.toHaveBeenCalled();
  });
});
