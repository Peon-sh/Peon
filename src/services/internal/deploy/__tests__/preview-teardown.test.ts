import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec: vi.fn() },
}));

import { sshPool } from '@/lib/ssh';
import {
  legacyPreviewSweep,
  tearDownPreviewStack,
} from '@/services/internal/deploy/preview-teardown';

const exec = vi.mocked(sshPool.exec);
const target = { host: 'h', user: 'u' } as never;

const opts = {
  serviceId: 'svc1',
  serviceUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  pullRequestId: 7,
  dir: '/data/peon/services/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/pr-7',
};

const command = () => exec.mock.calls[0]?.[1] as string;

describe('tearDownPreviewStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exec.mockResolvedValue({ code: 0, stdout: '', stderr: '' } as never);
  });

  it('downs the preview project scoped to this service', async () => {
    await tearDownPreviewStack(target, opts);

    expect(command()).toContain("docker compose -p 'peon-aaaaaaaa-bbb-pr-7' down --remove-orphans");
  });

  // Previews created before the project name was scoped sit in the shared
  // `pr-<n>` project. Removing them by container needs BOTH filters: the old
  // project name alone would match another service's preview for the same PR.
  it('removes pre-existing containers from the shared project, but only this service\'s', async () => {
    await tearDownPreviewStack(target, opts);

    const cmd = command();
    expect(cmd).toContain("--filter label='peon.serviceId=svc1'");
    expect(cmd).toContain("--filter label='com.docker.compose.project=pr-7'");
    expect(cmd).toContain('docker rm -f "$c"');
  });

  // Raw-compose stacks carry no Peon ownership label, so the second pass
  // identifies them by the directory compose recorded instead.
  it('also finds legacy containers by their compose working directory', async () => {
    await tearDownPreviewStack(target, opts);

    expect(command()).toContain(
      "--filter label='com.docker.compose.project.working_dir=" +
        "/data/peon/services/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/pr-7'",
    );
  });

  // Every sweep filter must be paired with the legacy project name, or it would
  // reach this service's *current* preview and delete what was just deployed.
  it('never sweeps containers outside the legacy project', () => {
    const sweep = legacyPreviewSweep(opts);

    for (const listing of sweep.split(';').filter((p) => p.includes('docker ps'))) {
      expect(listing).toContain("--filter label='com.docker.compose.project=pr-7'");
      expect(listing.match(/--filter/g)).toHaveLength(2);
    }
  });

  // A compose command that does not name a project falls back to the directory
  // default, which is the shared `pr-<n>` — exactly the collision being fixed.
  it('never aims a compose command at the shared project', async () => {
    await tearDownPreviewStack(target, opts);

    expect(command()).not.toContain("docker compose -p 'pr-7'");
    expect(command()).not.toContain('docker compose down');
  });

  it('skips the compose step when the preview was never written to disk', async () => {
    await tearDownPreviewStack(target, opts);

    expect(command()).toContain(
      "if [ -f '/data/peon/services/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/pr-7'/docker-compose.yml ]",
    );
  });

  it('shell-quotes the directory', async () => {
    await tearDownPreviewStack(target, { ...opts, dir: "/data/peon/services/x'y/pr-7" });

    expect(command()).toContain(`'/data/peon/services/x'\\''y/pr-7'`);
  });
});
