import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execStream, exec } = vi.hoisted(() => ({
  execStream: vi.fn(
    async (_target: unknown, _script: string, onChunk?: (c: string) => void) => {
      onChunk?.('cleanup done\n');
    },
  ),
  exec: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    serverSetting: {
      findUnique: vi.fn(),
    },
    server: {
      findUnique: vi.fn(),
    },
    workspaceAuditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { execStream, exec },
  sshTargetForServer: vi.fn(async () => ({ host: '1.2.3.4', port: 22, username: 'root' })),
}));

vi.mock('@/services/internal/server/agent', () => ({
  ensureAgentCredentials: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { ServerOperations } from '@/services/internal/server/operations';

describe('ServerOperations.cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.server.findUnique).mockResolvedValue({
      id: 'srv_1',
      name: 'web',
      workspaceId: 'ws_1',
    } as never);
    vi.mocked(prisma.workspaceAuditLog.create).mockResolvedValue({} as never);
  });

  it('passes saved volume and network toggles into the prune script', async () => {
    vi.mocked(prisma.serverSetting.findUnique).mockResolvedValue({
      deleteUnusedVolumes: true,
      deleteUnusedNetworks: true,
    } as never);

    const logs: string[] = [];
    await ServerOperations.cleanup('srv_1', async (m) => {
      logs.push(m);
    });

    expect(exec).toHaveBeenCalled();
    expect(execStream).toHaveBeenCalledTimes(1);
    expect(exec.mock.invocationCallOrder[0]).toBeLessThan(execStream.mock.invocationCallOrder[0]!);
    const script = execStream.mock.calls[0]![1] as string;
    expect(script).toContain('docker image prune -af');
    expect(script).toContain('docker volume prune -af');
    expect(script).toContain('docker network prune -f');
    expect(logs[0]).toMatch(/volumes=true.*networks=true/);
  });

  it('omits volume and network prune when toggles are off', async () => {
    vi.mocked(prisma.serverSetting.findUnique).mockResolvedValue({
      deleteUnusedVolumes: false,
      deleteUnusedNetworks: false,
    } as never);

    await ServerOperations.cleanup('srv_1');

    const script = execStream.mock.calls[0]![1] as string;
    expect(script).not.toContain('docker volume prune');
    expect(script).not.toContain('docker network prune');
  });
});
