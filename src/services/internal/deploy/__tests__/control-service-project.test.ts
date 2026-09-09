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

function service(activeContainerName: string | null) {
  return {
    id: 'svc1',
    name: 'app',
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    serverId: 'srv1',
    suspendedAt: null,
    activeContainerName,
  } as never;
}

/** Resolve the compose project of the active container to `project`. */
function hostReportsProject(project: string) {
  exec.mockResolvedValueOnce({ code: 0, stdout: `${project}\n`, stderr: '' } as never);
}

const composeCall = () => exec.mock.calls.at(-1)?.[1] as string;

// A rolling deploy owns its containers through a per-deployment compose project.
// Control actions used to run bare `docker compose`, which only sees the
// directory's default project, so Stop/Suspend reported success while the app
// stayed up. Every action must be aimed at the project that is really running.
describe('controlService compose project targeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    targetForServer.mockResolvedValue({ host: 'h', user: 'u' } as never);
    exec.mockResolvedValue({ code: 0, stdout: '', stderr: '' } as never);
    serviceUpdate.mockResolvedValue({} as never);
    serviceUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('stops the rolling project rather than the empty default one', async () => {
    serviceFindUnique.mockResolvedValue(service('app-1a2b3c4d'));
    hostReportsProject('peon-aaaaaaaabbbb-11112222');

    await controlService('svc1', 'stop');

    expect(exec.mock.calls[0]?.[1]).toContain('docker inspect');
    expect(composeCall()).toBe(
      "cd '/data/peon/services/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' && " +
        "docker compose -p 'peon-aaaaaaaabbbb-11112222' stop",
    );
  });

  it('suspends the rolling project, so scale-to-zero really scales to zero', async () => {
    serviceFindUnique.mockResolvedValue(service('app-1a2b3c4d'));
    hostReportsProject('peon-aaaaaaaabbbb-11112222');

    await controlService('svc1', 'suspend');

    expect(composeCall()).toContain("docker compose -p 'peon-aaaaaaaabbbb-11112222' stop");
    expect(serviceUpdate).toHaveBeenCalledWith({
      where: { id: 'svc1' },
      data: { status: 'SUSPENDED' },
    });
  });

  it('restarts and resumes the rolling project', async () => {
    serviceFindUnique.mockResolvedValue(service('app-1a2b3c4d'));
    hostReportsProject('peon-aaaaaaaabbbb-11112222');

    await controlService('svc1', 'restart');
    expect(composeCall()).toContain("docker compose -p 'peon-aaaaaaaabbbb-11112222' restart");

    hostReportsProject('peon-aaaaaaaabbbb-11112222');
    await controlService('svc1', 'resume');
    expect(composeCall()).toContain("docker compose -p 'peon-aaaaaaaabbbb-11112222' up -d");
  });

  // COMPOSE and DATABASE services never roll, so nothing is recorded as active
  // and compose must keep deriving the project from the directory.
  it('leaves the project to compose when no container is recorded as active', async () => {
    serviceFindUnique.mockResolvedValue(service(null));

    await controlService('svc1', 'stop');

    expect(exec).toHaveBeenCalledTimes(1);
    expect(composeCall()).toBe(
      "cd '/data/peon/services/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' && docker compose stop",
    );
  });

  // Docker cleanup prunes stopped containers, so a suspended service may have
  // nothing left to inspect. `up -d` then has to rebuild it in the default project.
  it('falls back to the default project when the container is gone', async () => {
    serviceFindUnique.mockResolvedValue(service('app-1a2b3c4d'));
    exec.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' } as never);

    await controlService('svc1', 'resume');

    expect(composeCall()).toContain('docker compose up -d');
    expect(composeCall()).not.toContain('-p');
  });

  it('treats an unlabelled container as the default project', async () => {
    serviceFindUnique.mockResolvedValue(service('app-1a2b3c4d'));
    hostReportsProject('<no value>');

    await controlService('svc1', 'stop');

    expect(composeCall()).not.toContain('-p');
  });

  it('shell-quotes a project name so it cannot break out of the command', async () => {
    serviceFindUnique.mockResolvedValue(service('app-1a2b3c4d'));
    hostReportsProject("peon-x'; rm -rf /");

    await controlService('svc1', 'stop');

    expect(composeCall()).toContain(`-p 'peon-x'\\''; rm -rf /' stop`);
  });
});
