import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    server: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  assertRemoteOnlyField,
  DEFAULT_LOCAL_SERVER_NAME,
  ensureLocalServer,
  findLocalServer,
  isLocalServer,
} from '../local-server';

const findFirst = vi.mocked(prisma.server.findFirst);
const create = vi.mocked(prisma.server.create);

describe('local server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'srv-local', executionMode: 'LOCAL' } as never);
  });

  describe('ensureLocalServer', () => {
    it('creates a LOCAL server when none exists', async () => {
      findFirst.mockResolvedValue(null as never);
      await ensureLocalServer({ workspaceId: 'ws1' });

      const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data.executionMode).toBe('LOCAL');
      expect(data.workspaceId).toBe('ws1');
      expect(data.name).toBe(DEFAULT_LOCAL_SERVER_NAME);
    });

    it('is idempotent — returns the existing server instead of a duplicate', async () => {
      // The installer and onboarding may both call this without coordinating.
      findFirst.mockResolvedValue({ id: 'existing', executionMode: 'LOCAL' } as never);

      const server = await ensureLocalServer({ workspaceId: 'ws1' });

      expect(server).toMatchObject({ id: 'existing' });
      expect(create).not.toHaveBeenCalled();
    });

    it('requires no SSH credentials', async () => {
      // The whole point: no keypair, no sshd, no 127.0.0.1.
      findFirst.mockResolvedValue(null as never);
      await ensureLocalServer({ workspaceId: 'ws1' });

      const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data.privateKeyId).toBeNull();
      expect(data.ip).not.toMatch(/127\.0\.0\.1|localhost/);
    });

    it('defaults to one concurrent build', async () => {
      // Control plane and workloads share CPU on a single server.
      findFirst.mockResolvedValue(null as never);
      await ensureLocalServer({ workspaceId: 'ws1' });

      const data = create.mock.calls[0]?.[0] as {
        data: { settings: { create: { concurrentBuilds: number } } };
      };
      expect(data.data.settings.create.concurrentBuilds).toBe(1);
    });

    it('creates a default docker destination', async () => {
      findFirst.mockResolvedValue(null as never);
      await ensureLocalServer({ workspaceId: 'ws1' });

      const data = create.mock.calls[0]?.[0] as {
        data: { destinations: { create: { network: string } } };
      };
      expect(data.data.destinations.create.network).toBe('peon');
    });

    it('does not assume reachability', async () => {
      findFirst.mockResolvedValue(null as never);
      await ensureLocalServer({ workspaceId: 'ws1' });

      const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data.isReachable).toBe(false);
      expect(data.isUsable).toBe(false);
    });

    it('accepts a custom name and wildcard domain', async () => {
      findFirst.mockResolvedValue(null as never);
      await ensureLocalServer({
        workspaceId: 'ws1',
        name: 'Prod box',
        wildcardDomain: '*.apps.example.com',
      });

      const data = create.mock.calls[0]?.[0] as {
        data: { name: string; settings: { create: { wildcardDomain?: string } } };
      };
      expect(data.data.name).toBe('Prod box');
      expect(data.data.settings.create.wildcardDomain).toBe('*.apps.example.com');
    });
  });

  describe('hybrid', () => {
    it('scopes the lookup to one workspace and to LOCAL only', async () => {
      // A workspace may hold one local server and many remote ones at once —
      // local vs remote is a per-server property, not an installation mode.
      findFirst.mockResolvedValue(null as never);
      await findLocalServer('ws1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws1', executionMode: 'LOCAL' },
      });
    });
  });

  describe('guards', () => {
    it('identifies local and remote servers', () => {
      expect(isLocalServer({ executionMode: 'LOCAL' })).toBe(true);
      expect(isLocalServer({ executionMode: 'REMOTE' })).toBe(false);
    });

    it('rejects SSH-only field edits on a local server', () => {
      expect(() => assertRemoteOnlyField({ executionMode: 'LOCAL' }, 'ip')).toThrow(
        /does not apply to a local server/,
      );
    });

    it('permits them on a remote server', () => {
      expect(() => assertRemoteOnlyField({ executionMode: 'REMOTE' }, 'ip')).not.toThrow();
    });
  });
});
