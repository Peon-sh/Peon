import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  updateUserById,
  revokeOthers,
  hashPassword,
  comparePassword,
  validatePassword,
  reissueToken,
} = vi.hoisted(() => ({
  updateUserById: vi.fn(),
  revokeOthers: vi.fn(),
  hashPassword: vi.fn(async () => 'hashed'),
  comparePassword: vi.fn(),
  validatePassword: vi.fn(() => null),
  reissueToken: vi.fn(async () => 'jwt'),
}));

vi.mock('@/services/internal/auth/users', () => ({
  updateUserById,
}));

vi.mock('@/services/internal/auth/sessions', () => ({
  AuthSessionService: {
    revokeOthers,
  },
}));

vi.mock('@/lib/auth/password', () => ({
  hashPassword,
  comparePassword,
  validatePassword,
}));

vi.mock('@/services/internal/auth/auth', () => ({
  reissueToken,
}));

vi.mock('@/services/external/s3/assets', () => ({
  deletePlatformObject: vi.fn(),
  isPlatformS3Configured: () => true,
  PlatformS3Keys: { userAvatar: (id: string, ext: string) => `users/${id}/avatar.${ext}` },
  platformObjectPublicUrl: (key: string) => `https://cdn/${key}`,
  presignPlatformPutObject: vi.fn(async () => 'https://upload'),
}));

vi.mock('@/lib/auth/instance-owner', () => ({
  isInstanceOwnerEmail: () => false,
}));

vi.mock('@/lib/auth/profile-picture', () => ({
  resolveProfilePictureUrl: async (v: string | null) => {
    if (!v) return null;
    if (v.startsWith('http')) return v;
    return `https://signed.example/${v}`;
  },
  isPlatformAvatarKey: (key: string | null | undefined) =>
    !!key && key.startsWith('users/') && !/^https?:\/\//i.test(key),
  avatarKeyForUser: (userId: string, key: string) => key.startsWith(`users/${userId}/avatar.`),
}));

import { ProfileService } from '../profile';

const baseUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'Ada',
  passwordHash: null as string | null,
  googleId: 'g1',
  profilePicture: null as string | null,
  emailVerifiedAt: null,
  isInstanceAdmin: false,
  isOnboarded: true,
  onboardingCompletedAt: null,
  lastSeenAt: null,
  twoFactorSecret: null,
  twoFactorRecoveryCodes: null,
  twoFactorConfirmedAt: null,
  pendingEmail: null,
  forcePasswordReset: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProfileService.setPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserById.mockImplementation(async (_id: string, data: { passwordHash?: string }) => ({
      ...baseUser,
      passwordHash: data.passwordHash ?? 'hashed',
    }));
  });

  it('sets password for Google-only users without current password', async () => {
    const result = await ProfileService.setPassword(baseUser as never, 'sid1', {
      newPassword: 'Secret123',
    });
    expect(hashPassword).toHaveBeenCalledWith('Secret123');
    expect(revokeOthers).toHaveBeenCalledWith('u1', 'sid1');
    expect(result.user.hasPassword).toBe(true);
  });

  it('requires current password when one exists', async () => {
    comparePassword.mockResolvedValue(false);
    await expect(
      ProfileService.setPassword(
        { ...baseUser, passwordHash: 'old' } as never,
        'sid1',
        { currentPassword: 'wrong', newPassword: 'Secret123' },
      ),
    ).rejects.toThrow(/incorrect/i);
  });

  it('changes password when current matches', async () => {
    comparePassword.mockResolvedValue(true);
    await ProfileService.setPassword(
      { ...baseUser, passwordHash: 'old' } as never,
      'sid1',
      { currentPassword: 'OldPass1', newPassword: 'Secret123' },
    );
    expect(comparePassword).toHaveBeenCalledWith('OldPass1', 'old');
    expect(revokeOthers).toHaveBeenCalled();
  });
});

describe('ProfileService.updateName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserById.mockImplementation(async (_id: string, data: { name?: string }) => ({
      ...baseUser,
      name: data.name ?? null,
    }));
  });

  it('rejects empty names', async () => {
    await expect(ProfileService.updateName(baseUser as never, 'sid', '   ')).rejects.toThrow(
      /required/i,
    );
  });

  it('saves trimmed name', async () => {
    const result = await ProfileService.updateName(baseUser as never, 'sid', '  Ada Lovelace  ');
    expect(updateUserById).toHaveBeenCalledWith('u1', { name: 'Ada Lovelace' });
    expect(result.user.name).toBe('Ada Lovelace');
  });
});

describe('ProfileService.confirmAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserById.mockImplementation(async (_id: string, data: { profilePicture?: string }) => ({
      ...baseUser,
      profilePicture: data.profilePicture ?? null,
    }));
  });

  it('rejects keys for other users', async () => {
    await expect(
      ProfileService.confirmAvatar(baseUser as never, 'sid', 'users/other/avatar.png'),
    ).rejects.toThrow(/invalid/i);
  });

  it('stores owned avatar key', async () => {
    const result = await ProfileService.confirmAvatar(
      baseUser as never,
      'sid',
      'users/u1/avatar.webp',
    );
    expect(updateUserById).toHaveBeenCalledWith('u1', {
      profilePicture: 'users/u1/avatar.webp',
    });
    expect(result.user.profilePicture).toBe(
      'https://signed.example/users/u1/avatar.webp',
    );
  });
});
