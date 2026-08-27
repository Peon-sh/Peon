import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  connect: null as (() => void) | null,
  dispose: vi.fn(),
}));

vi.mock('node-ssh', () => ({
  NodeSSH: class {
    connect = vi.fn(() => new Promise<void>((resolve) => {
      state.connect = resolve;
    }));
    dispose = state.dispose;
    isConnected = vi.fn(() => true);
    execCommand = vi.fn();
    connection = null;
  },
}));

vi.mock('@/lib/e2e', () => ({
  isE2eMode: vi.fn(() => false),
}));

vi.mock('../host', () => ({
  sshConnectHostOptions: vi.fn(() => ({ host: 'host' })),
}));

vi.mock('../host-key', () => ({
  createHostKeyVerifier: vi.fn(() => ({ verify: vi.fn(), mismatch: null, learned: null })),
  HostKeyMismatchError: class HostKeyMismatchError extends Error {},
}));

import { sshPool } from '../pool';
import type { SshTarget } from '../types';

const target: SshTarget = {
  id: 'srv-race',
  host: '127.0.0.1',
  port: 22,
  username: 'root',
  privateKey: 'key',
};

describe('sshPool connection invalidation', () => {
  beforeEach(() => {
    sshPool.disconnect(target.id);
    state.connect = null;
    state.dispose.mockClear();
  });

  it('does not reinsert a connection after disconnect during connect', async () => {
    const pending = sshPool.exec(target, 'echo ok');
    await Promise.resolve();

    sshPool.disconnect(target.id);
    state.connect?.();

    await expect(pending).rejects.toThrow('disconnected while connecting');
    expect(state.dispose).toHaveBeenCalledOnce();
  });
});
