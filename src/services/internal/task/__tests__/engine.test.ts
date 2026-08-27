import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    scheduledTask: { findUnique: vi.fn() },
    scheduledTaskExecution: { update: vi.fn() },
  },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec: vi.fn() },
  sshTargetForServer: vi.fn(),
}));

vi.mock('@/services/internal/notifications/events', () => ({
  notifyService: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { sshPool, sshTargetForServer } from '@/lib/ssh';
import { notifyService } from '@/services/internal/notifications/events';
import { runScheduledTask } from '@/services/internal/task/engine';

const taskFindUnique = vi.mocked(prisma.scheduledTask.findUnique);
const executionUpdate = vi.mocked(prisma.scheduledTaskExecution.update);
const exec = vi.mocked(sshPool.exec);
const targetForServer = vi.mocked(sshTargetForServer);
const notify = vi.mocked(notifyService);

describe('runScheduledTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskFindUnique.mockResolvedValue({
      id: 'task1',
      name: 'backup',
      command: 'npm run backup',
      container: null,
      service: {
        id: 'svc1',
        name: 'app',
        uuid: 'uuid-1',
        serverId: 'srv1',
        activeContainerName: 'app-1',
      },
    } as never);
    targetForServer.mockResolvedValue({ host: 'host', user: 'user' } as never);
    executionUpdate.mockResolvedValue({} as never);
    notify.mockResolvedValue(undefined);
  });

  it('keeps command output when a task exits with an error', async () => {
    exec.mockResolvedValue({
      code: 1,
      stdout: 'backup started\n',
      stderr: 'permission denied\n',
    } as never);

    await expect(runScheduledTask('task1', 'execution1')).rejects.toThrow(
      'backup started\npermission denied\n',
    );

    expect(executionUpdate).toHaveBeenLastCalledWith({
      where: { id: 'execution1' },
      data: expect.objectContaining({
        status: 'FAILED',
        message: 'backup started\npermission denied\n',
      }),
    });
    expect(notify).toHaveBeenCalledWith(
      'svc1',
      'task_failure',
      expect.objectContaining({
        text: expect.stringContaining('permission denied'),
      }),
    );
  });
});
