import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { count: vi.fn() },
    instanceSettings: { findUnique: vi.fn() },
    workspaceInvitation: { findFirst: vi.fn() },
    projectInvitation: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { assertRegistrationAllowed, isRegistrationAllowed } from '../instance';

const users = vi.mocked(prisma.user.count);
const settings = vi.mocked(prisma.instanceSettings.findUnique);
const wsInvite = vi.mocked(prisma.workspaceInvitation.findFirst);
const projInvite = vi.mocked(prisma.projectInvitation.findFirst);

/** Populated instance with registration switched off, no pending invitations. */
function closedInstance() {
  users.mockResolvedValue(3);
  settings.mockResolvedValue({ isRegistrationEnabled: false } as never);
  wsInvite.mockResolvedValue(null as never);
  projInvite.mockResolvedValue(null as never);
}

describe('isRegistrationAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the very first user even when registration is disabled', async () => {
    users.mockResolvedValue(0);
    settings.mockResolvedValue({ isRegistrationEnabled: false } as never);

    await expect(isRegistrationAllowed('first@example.com')).resolves.toBe(true);
    // Bootstrap short-circuits before reading settings at all.
    expect(settings).not.toHaveBeenCalled();
  });

  it('allows signup when registration is enabled', async () => {
    users.mockResolvedValue(5);
    settings.mockResolvedValue({ isRegistrationEnabled: true } as never);

    await expect(isRegistrationAllowed('someone@example.com')).resolves.toBe(true);
  });

  it('allows signup when the settings row does not exist yet (defaults are open)', async () => {
    users.mockResolvedValue(5);
    settings.mockResolvedValue(null as never);

    await expect(isRegistrationAllowed('someone@example.com')).resolves.toBe(true);
  });

  it('blocks signup when registration is disabled and no invitation exists', async () => {
    closedInstance();

    await expect(isRegistrationAllowed('stranger@example.com')).resolves.toBe(false);
  });

  it('allows signup with a pending workspace invitation', async () => {
    closedInstance();
    wsInvite.mockResolvedValue({ id: 'inv-1' } as never);

    await expect(isRegistrationAllowed('invited@example.com')).resolves.toBe(true);
  });

  it('allows signup with a pending project invitation', async () => {
    closedInstance();
    projInvite.mockResolvedValue({ id: 'inv-2' } as never);

    await expect(isRegistrationAllowed('invited@example.com')).resolves.toBe(true);
  });

  it('only considers PENDING invitations, matched case-insensitively', async () => {
    closedInstance();
    await isRegistrationAllowed('Invited@Example.com');

    expect(wsInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: 'Invited@Example.com', mode: 'insensitive' },
          status: 'PENDING',
        },
      }),
    );
  });
});

describe('assertRegistrationAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when registration is allowed', async () => {
    users.mockResolvedValue(0);

    await expect(assertRegistrationAllowed('first@example.com')).resolves.toBeUndefined();
  });

  it('throws a 403 with a REGISTRATION_DISABLED code when blocked', async () => {
    closedInstance();

    await expect(assertRegistrationAllowed('stranger@example.com')).rejects.toMatchObject({
      status: 403,
      code: 'REGISTRATION_DISABLED',
    });
  });

  it('does not leak whether the email was invited', async () => {
    closedInstance();

    await expect(assertRegistrationAllowed('stranger@example.com')).rejects.toThrow(
      /Registration is disabled on this instance/,
    );
  });
});
