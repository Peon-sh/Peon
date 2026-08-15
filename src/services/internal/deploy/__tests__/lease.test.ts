import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    deployment: { updateMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  isDeployLeaseExpired,
  releaseDeployLease,
  renewDeployLease,
  tryAcquireDeployLease,
} from '../lease';

const updateMany = vi.mocked(prisma.deployment.updateMany);

describe('isDeployLeaseExpired', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('treats a missing lease as expired so the first worker can claim', () => {
    expect(isDeployLeaseExpired(null, now)).toBe(true);
    expect(isDeployLeaseExpired(undefined, now)).toBe(true);
  });

  it('treats a future lease as held', () => {
    expect(isDeployLeaseExpired(new Date('2026-08-15T12:01:00.000Z'), now)).toBe(false);
  });

  it('treats a past lease as take-overable after a worker crash', () => {
    expect(isDeployLeaseExpired(new Date('2026-08-15T11:59:00.000Z'), now)).toBe(true);
  });
});

describe('tryAcquireDeployLease', () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it('claims when no other worker holds a live lease', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-08-15T12:00:00.000Z');
    await expect(tryAcquireDeployLease('dep1', 'worker-a', now, 120_000)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'dep1',
        status: 'IN_PROGRESS',
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { leaseOwner: 'worker-a', leaseUntil: new Date('2026-08-15T12:02:00.000Z') },
    });
  });

  it('loses when another worker already holds the lease', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(tryAcquireDeployLease('dep1', 'worker-b')).resolves.toBe(false);
  });
});

describe('renewDeployLease', () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it('renews only the owner of an in-progress deploy', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-08-15T12:00:00.000Z');
    await expect(renewDeployLease('dep1', 'worker-a', now, 120_000)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'dep1', leaseOwner: 'worker-a', status: 'IN_PROGRESS' },
      data: { leaseUntil: new Date('2026-08-15T12:02:00.000Z') },
    });
  });

  it('returns false after cancel or takeover', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(renewDeployLease('dep1', 'worker-a')).resolves.toBe(false);
  });
});

describe('releaseDeployLease', () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it('clears the lease only for the owning worker', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await releaseDeployLease('dep1', 'worker-a');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'dep1', leaseOwner: 'worker-a' },
      data: { leaseOwner: null, leaseUntil: null },
    });
  });
});
