import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec: vi.fn() },
  sshTargetForServer: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { sshPool, sshTargetForServer } from '@/lib/ssh';
import { teardownService } from '@/services/internal/deploy/engine';

const findUnique = vi.mocked(prisma.service.findUnique);
const exec = vi.mocked(sshPool.exec);
const targetForServer = vi.mocked(sshTargetForServer);

const DIR = '/data/peon/services/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function service(overrides?: { serverId?: string | null }) {
  return {
    id: 'svc1',
    name: 'app',
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    serverId: overrides?.serverId === undefined ? 'srv1' : overrides.serverId,
  } as never;
}

describe('teardownService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    targetForServer.mockResolvedValue({ host: 'h', user: 'u' } as never);
    exec.mockResolvedValue({ code: 0, stdout: '', stderr: '' } as never);
  });

  it('does nothing when the service has no server', async () => {
    findUnique.mockResolvedValue(service({ serverId: null }));

    await teardownService('svc1');

    expect(targetForServer).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('downs the stack with its volumes and removes the directory', async () => {
    findUnique.mockResolvedValue(service());

    await teardownService('svc1');

    expect(targetForServer).toHaveBeenCalledWith('srv1');
    const cmd = exec.mock.calls[0]?.[1] as string;
    expect(cmd).toContain(`(cd '${DIR}' && docker compose down -v --remove-orphans)`);
    expect(cmd).toMatch(new RegExp(`rm -rf '${DIR}'$`));
  });

  // Rolling deploys run `compose up -p peon-<svc>-<deploy>`, and previews live in
  // `pr-*` subdirectories, so neither is reachable via the directory's default
  // compose project. Both carry the service label.
  it('force-removes containers left in other compose projects for this service', async () => {
    findUnique.mockResolvedValue(service());

    await teardownService('svc1');

    const cmd = exec.mock.calls[0]?.[1] as string;
    expect(cmd).toContain("docker ps -aq --filter label='peon.serviceId=svc1'");
    expect(cmd).toContain('docker rm -f "$c"');
  });

  // `pr-*` is the compose project name of every service's preview for that PR
  // number, so tearing those directories down could hit another service.
  it('does not target preview directories by path', async () => {
    findUnique.mockResolvedValue(service());

    await teardownService('svc1');

    expect(exec.mock.calls[0]?.[1] as string).not.toContain('pr-');
  });
});
