import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { count: vi.fn() },
    setupToken: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return { ...actual, serverEnv: vi.fn(() => ({ APP_URL: 'https://peon.example.com' })) };
});

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  consumeSetupToken,
  issueSetupToken,
  verifySetupToken,
} from '../setup-token';

const userCount = vi.mocked(prisma.user.count);
const findFirst = vi.mocked(prisma.setupToken.findFirst);
const findUnique = vi.mocked(prisma.setupToken.findUnique);
const create = vi.mocked(prisma.setupToken.create);
const update = vi.mocked(prisma.setupToken.update);
const updateMany = vi.mocked(prisma.setupToken.updateMany);

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const future = () => new Date(Date.now() + 3_600_000);
const past = () => new Date(Date.now() - 1_000);

describe('setup token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({} as never);
    update.mockResolvedValue({} as never);
    updateMany.mockResolvedValue({ count: 1 } as never);
    findFirst.mockResolvedValue(null as never);
  });

  describe('issuing', () => {
    it('issues a token on a fresh instance', async () => {
      userCount.mockResolvedValue(0);
      const issued = await issueSetupToken();

      expect(issued).not.toBeNull();
      expect(issued!.url).toBe(`https://peon.example.com/setup/${issued!.token}`);
      expect(issued!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('refuses once any user exists', async () => {
      // A leaked or re-run installer must not mint an admin on a live instance.
      userCount.mockResolvedValue(1);
      await expect(issueSetupToken()).resolves.toBeNull();
      expect(create).not.toHaveBeenCalled();
    });

    it('stores only a hash, never the plaintext', async () => {
      userCount.mockResolvedValue(0);
      const issued = await issueSetupToken();

      const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data.tokenHash).toBe(hash(issued!.token));
      expect(JSON.stringify(data)).not.toContain(issued!.token);
    });

    it('generates a long random token', async () => {
      userCount.mockResolvedValue(0);
      const a = await issueSetupToken();
      const b = await issueSetupToken();

      expect(a!.token).not.toBe(b!.token);
      expect(a!.token.length).toBeGreaterThanOrEqual(40);
    });

    it('expires a previous unused token rather than leaving two valid', async () => {
      userCount.mockResolvedValue(0);
      findFirst.mockResolvedValue({ id: 'old', expiresAt: future() } as never);

      await issueSetupToken();

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'old' } }),
      );
    });
  });

  describe('verifying', () => {
    it('accepts a valid unused token', async () => {
      userCount.mockResolvedValue(0);
      findUnique.mockResolvedValue({
        tokenHash: hash('good'), expiresAt: future(), usedAt: null,
      } as never);

      await expect(verifySetupToken('good')).resolves.toBe(true);
    });

    it('rejects an unknown token', async () => {
      userCount.mockResolvedValue(0);
      findUnique.mockResolvedValue(null as never);
      await expect(verifySetupToken('nope')).resolves.toBe(false);
    });

    it('rejects an expired token', async () => {
      userCount.mockResolvedValue(0);
      findUnique.mockResolvedValue({
        tokenHash: hash('old'), expiresAt: past(), usedAt: null,
      } as never);
      await expect(verifySetupToken('old')).resolves.toBe(false);
    });

    it('rejects an already-used token', async () => {
      userCount.mockResolvedValue(0);
      findUnique.mockResolvedValue({
        tokenHash: hash('used'), expiresAt: future(), usedAt: new Date(),
      } as never);
      await expect(verifySetupToken('used')).resolves.toBe(false);
    });

    it('rejects every token once a user exists', async () => {
      // The critical replay guard.
      userCount.mockResolvedValue(1);
      findUnique.mockResolvedValue({
        tokenHash: hash('good'), expiresAt: future(), usedAt: null,
      } as never);
      await expect(verifySetupToken('good')).resolves.toBe(false);
    });

    it('rejects an empty token without querying', async () => {
      await expect(verifySetupToken('')).resolves.toBe(false);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('consuming', () => {
    it('consumes a valid token', async () => {
      userCount.mockResolvedValue(0);
      findUnique.mockResolvedValue({
        tokenHash: hash('good'), expiresAt: future(), usedAt: null,
      } as never);

      await expect(consumeSetupToken('good')).resolves.toBeUndefined();
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hash('good'), usedAt: null } }),
      );
    });

    it('marks it used atomically so a race cannot double-consume', async () => {
      userCount.mockResolvedValue(0);
      findUnique.mockResolvedValue({
        tokenHash: hash('good'), expiresAt: future(), usedAt: null,
      } as never);
      // Another request won the race.
      updateMany.mockResolvedValue({ count: 0 } as never);

      await expect(consumeSetupToken('good')).rejects.toMatchObject({
        code: 'SETUP_TOKEN_INVALID',
      });
    });

    it('throws a 403 for an invalid token', async () => {
      userCount.mockResolvedValue(0);
      findUnique.mockResolvedValue(null as never);

      await expect(consumeSetupToken('bad')).rejects.toMatchObject({ status: 403 });
    });
  });
});
