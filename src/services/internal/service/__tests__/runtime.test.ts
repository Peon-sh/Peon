import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma: { service: { findFirst } } }));
vi.mock('@/lib/crypto/encryption', () => ({
  decrypt: (value: string) => value,
}));
vi.mock('@/lib/ssh', () => ({ sshPool: { exec: vi.fn() } }));
vi.mock('@/lib/docker/compose', () => ({
  parseCompose: vi.fn(),
  pickPrimaryComposeService: vi.fn(),
}));
vi.mock('@/lib/docker/naming', () => ({
  containerName: (name: string, uuid: string) => `${name}-${uuid}`,
}));
vi.mock('@/lib/shell/quote', () => ({
  shellSingleQuote: (value: string) => `'${value}'`,
  dockerExecShellCommand: vi.fn(),
}));
vi.mock('@/lib/errors', () => ({
  AppError: class extends Error {},
  NotFoundError: class extends Error {},
}));

const serviceOn = (
  serverId: string,
  host: string,
  activeContainerName = `${serverId}-container`
) => ({
  serverId,
  name: 'app',
  uuid: 'svc',
  activeContainerName,
  kind: 'APPLICATION',
  dockerComposeRaw: null,
  server: {
    id: serverId,
    ip: host,
    port: 22,
    user: 'root',
    privateKey: { privateKey: `${serverId}-key` },
  },
  settings: null,
});

describe('ServiceRuntime', () => {
  let serviceRuntime: typeof import('../runtime').ServiceRuntime;

  beforeEach(async () => {
    findFirst.mockReset();
    ({ ServiceRuntime: serviceRuntime } = await import('../runtime'));
    serviceRuntime.invalidate('svc-id');
  });

  it('uses the current server after its cached context is invalidated', async () => {
    findFirst.mockResolvedValueOnce(serviceOn('server-a', '10.0.0.1'));

    const first = await serviceRuntime.resolveContainer('svc-id');
    serviceRuntime.invalidate('svc-id');
    findFirst.mockResolvedValueOnce(serviceOn('server-b', '10.0.0.2'));
    const second = await serviceRuntime.resolveContainer('svc-id');

    expect(first.target.host).toBe('10.0.0.1');
    expect(second.target.host).toBe('10.0.0.2');
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('drops a cached context when the server changes in another process', async () => {
    findFirst
      .mockResolvedValueOnce(serviceOn('server-a', '10.0.0.1'))
      .mockResolvedValueOnce({ serverId: 'server-b' })
      .mockResolvedValueOnce(serviceOn('server-b', '10.0.0.2'));

    await serviceRuntime.resolveContainer('svc-id');
    const current = await serviceRuntime.resolveContainer('svc-id');

    expect(current.target.host).toBe('10.0.0.2');
    expect(findFirst).toHaveBeenCalledTimes(3);
  });

  it('does not repopulate the cache after an invalidation races a lookup', async () => {
    let resolveLookup!: (value: ReturnType<typeof serviceOn>) => void;
    findFirst.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLookup = resolve;
      })
    );

    const pending = serviceRuntime.resolveContainer('svc-id');
    serviceRuntime.invalidate('svc-id');
    resolveLookup(serviceOn('server-a', '10.0.0.1'));
    await pending;

    findFirst.mockResolvedValueOnce(
      serviceOn('server-a', '10.0.0.1', 'new-container')
    );
    const current = await serviceRuntime.resolveContainer('svc-id');

    expect(current.container).toBe('new-container');
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
