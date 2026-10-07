import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exec, create, findMany, deleteMany } = vi.hoisted(() => ({
  exec: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    serviceContainerLog: { create, findMany, deleteMany },
  },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec },
}));

import { archiveContainerLogs } from '../container-logs';

const target = { id: 'srv', host: '10.0.0.1', port: 22, username: 'root', privateKey: 'key' };

describe('archiveContainerLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'row' });
    findMany.mockResolvedValue([]);
    deleteMany.mockResolvedValue({ count: 0 });
  });

  it('stores the container output and drops archives past the keep limit', async () => {
    exec.mockResolvedValue({ code: 0, stdout: 'hello\n', stderr: '' });
    findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);

    await archiveContainerLogs({
      target,
      serviceId: 'svc',
      containerName: 'api-1',
      deploymentId: 'dep',
      reason: 'deploy',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        serviceId: 'svc',
        deploymentId: 'dep',
        containerName: 'api-1',
        reason: 'deploy',
        content: 'hello',
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-1', 'old-2'] } } });
  });

  it('skips a missing container', async () => {
    exec.mockResolvedValue({ code: 1, stdout: 'No such container', stderr: '' });

    await archiveContainerLogs({
      target,
      serviceId: 'svc',
      containerName: 'gone',
      reason: 'rolling',
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('does not throw when the host command fails', async () => {
    exec.mockRejectedValue(new Error('ssh down'));

    await expect(
      archiveContainerLogs({
        target,
        serviceId: 'svc',
        containerName: 'api-1',
        reason: 'cleanup',
      }),
    ).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});
