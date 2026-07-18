import { beforeEach, describe, expect, it, vi } from 'vitest';

const presignPlatformObject = vi.hoisted(() =>
  vi.fn(async (key: string) => `https://signed.example/${key}?X-Amz-Signature=abc`),
);
const isPlatformS3Configured = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/services/external/s3/assets', () => ({
  PRESIGN_MAX_EXPIRES_SECONDS: 60 * 60 * 24 * 7,
  presignPlatformObject,
  isPlatformS3Configured,
}));

import {
  avatarKeyForUser,
  isPlatformAvatarKey,
  resolveProfilePictureUrl,
} from '../profile-picture';

describe('resolveProfilePictureUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPlatformS3Configured.mockReturnValue(true);
  });

  it('returns null for empty', async () => {
    expect(await resolveProfilePictureUrl(null)).toBeNull();
    expect(await resolveProfilePictureUrl('')).toBeNull();
  });

  it('passes through absolute URLs', async () => {
    expect(await resolveProfilePictureUrl('https://lh3.googleusercontent.com/a/xyz')).toBe(
      'https://lh3.googleusercontent.com/a/xyz',
    );
    expect(presignPlatformObject).not.toHaveBeenCalled();
  });

  it('presigns S3 avatar keys', async () => {
    await expect(resolveProfilePictureUrl('users/u1/avatar.webp')).resolves.toBe(
      'https://signed.example/users/u1/avatar.webp?X-Amz-Signature=abc',
    );
    expect(presignPlatformObject).toHaveBeenCalledWith(
      'users/u1/avatar.webp',
      60 * 60 * 24 * 7,
    );
  });

  it('returns null when S3 is not configured', async () => {
    isPlatformS3Configured.mockReturnValue(false);
    await expect(resolveProfilePictureUrl('users/u1/avatar.webp')).resolves.toBeNull();
  });
});

describe('avatar key helpers', () => {
  it('detects platform avatar keys', () => {
    expect(isPlatformAvatarKey('users/u1/avatar.png')).toBe(true);
    expect(isPlatformAvatarKey('https://example.com/a.png')).toBe(false);
  });

  it('checks ownership prefix', () => {
    expect(avatarKeyForUser('u1', 'users/u1/avatar.jpg')).toBe(true);
    expect(avatarKeyForUser('u1', 'users/u2/avatar.jpg')).toBe(false);
  });
});
