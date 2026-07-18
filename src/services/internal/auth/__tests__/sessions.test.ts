import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const updateMany = vi.fn();
const create = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    authSession: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: (...args: unknown[]) => updateMany(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

import { AuthSessionService } from '../sessions';

describe('AuthSessionService.assertActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without sid', async () => {
    expect(await AuthSessionService.assertActive(null)).toBeNull();
  });

  it('returns null when revoked', async () => {
    findUnique.mockResolvedValue({
      id: 's1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      ip: '1.1.1.1',
    });
    expect(await AuthSessionService.assertActive('s1')).toBeNull();
  });

  it('returns null when expired', async () => {
    findUnique.mockResolvedValue({
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      lastSeenAt: new Date(),
      ip: '1.1.1.1',
    });
    expect(await AuthSessionService.assertActive('s1')).toBeNull();
  });

  it('returns session when active', async () => {
    const row = {
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      ip: '1.1.1.1',
    };
    findUnique.mockResolvedValue(row);
    expect(await AuthSessionService.assertActive('s1')).toEqual(row);
  });
});

describe('AuthSessionService.revokeOthers', () => {
  it('updates other sessions', async () => {
    updateMany.mockResolvedValue({ count: 2 });
    await expect(AuthSessionService.revokeOthers('u1', 'sid-current')).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          id: { not: 'sid-current' },
        }),
      }),
    );
  });
});
