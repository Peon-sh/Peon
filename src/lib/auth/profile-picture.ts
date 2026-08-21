import {
  isPlatformS3Configured,
  PRESIGN_MAX_EXPIRES_SECONDS,
  presignPlatformObject,
} from '@/services/external/s3/assets';

/** Avatar display URLs: match JWT cookie TTL so /me + cookie stay aligned. */
const AVATAR_PRESIGN_SECONDS = PRESIGN_MAX_EXPIRES_SECONDS;

/**
 * Resolve stored profilePicture (S3 key or legacy absolute URL) for clients.
 * Uploaded avatars use a short-lived S3 GET presign (private bucket — no server streaming).
 */
export async function resolveProfilePictureUrl(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  if (!isPlatformAvatarKey(value)) return null;
  if (!isPlatformS3Configured()) return null;

  try {
    return await presignPlatformObject(value, AVATAR_PRESIGN_SECONDS);
  } catch (err) {
    console.error('Failed to presign avatar URL:', err);
    return null;
  }
}

export function isPlatformAvatarKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith('users/') && !/^https?:\/\//i.test(key);
}

export function avatarKeyForUser(userId: string, key: string): boolean {
  return key.startsWith(`users/${userId}/avatar.`);
}
