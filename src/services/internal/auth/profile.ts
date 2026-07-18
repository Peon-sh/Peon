import {
  deletePlatformObject,
  isPlatformS3Configured,
  PlatformS3Keys,
  platformObjectPublicUrl,
  presignPlatformPutObject,
} from '@/services/external/s3/assets';
import {
  avatarKeyForUser,
  isPlatformAvatarKey,
  resolveProfilePictureUrl,
} from '@/lib/auth/profile-picture';
import { reissueToken } from '@/services/internal/auth/auth';
import { AuthSessionService } from '@/services/internal/auth/sessions';
import { hashPassword, comparePassword, validatePassword } from '@/lib/auth/password';
import { updateUserById } from '@/services/internal/auth/users';
import { AppError, UnauthorizedError, ValidationError } from '@/lib/errors';
import type { User } from '@/lib/prisma';
import { isInstanceOwnerEmail } from '@/lib/auth/instance-owner';

const AVATAR_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profilePicture: await resolveProfilePictureUrl(user.profilePicture),
    hasPassword: Boolean(user.passwordHash),
    isInstanceAdmin: user.isInstanceAdmin,
    isInstanceOwner: isInstanceOwnerEmail(user.email),
    isOnboarded: user.isOnboarded,
  };
}

async function withReissuedToken(user: User, sid: string) {
  const token = await reissueToken(user, sid);
  return { user: await publicUser(user), token };
}

export const ProfileService = {
  async updateName(user: User, sid: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError('Name is required.');
    if (trimmed.length > 100) throw new ValidationError('Name must be at most 100 characters.');
    const updated = await updateUserById(user.id, { name: trimmed });
    return withReissuedToken(updated, sid);
  },

  async presignAvatar(user: User, contentType: string) {
    if (!isPlatformS3Configured()) {
      throw new AppError('Avatar uploads require platform S3 (S3_BUCKET).', 503, 'S3_NOT_CONFIGURED');
    }
    const ext = AVATAR_CONTENT_TYPES[contentType];
    if (!ext) {
      throw new ValidationError('Avatar must be a JPEG, PNG, or WebP image.');
    }
    const key = PlatformS3Keys.userAvatar(user.id, ext);
    const uploadUrl = await presignPlatformPutObject(key, contentType);
    return {
      uploadUrl,
      key,
      publicUrl: platformObjectPublicUrl(key),
      headers: { 'Content-Type': contentType },
    };
  },

  async confirmAvatar(user: User, sid: string, key: string) {
    if (!avatarKeyForUser(user.id, key)) {
      throw new ValidationError('Invalid avatar key.');
    }
    const previous = user.profilePicture;
    const updated = await updateUserById(user.id, { profilePicture: key });
    if (previous && isPlatformAvatarKey(previous) && previous !== key) {
      try {
        await deletePlatformObject(previous);
      } catch (err) {
        console.error('Failed to delete previous avatar:', err);
      }
    }
    return withReissuedToken(updated, sid);
  },

  async removeAvatar(user: User, sid: string) {
    const previous = user.profilePicture;
    const updated = await updateUserById(user.id, { profilePicture: null });
    if (isPlatformAvatarKey(previous)) {
      try {
        await deletePlatformObject(previous!);
      } catch (err) {
        console.error('Failed to delete avatar object:', err);
      }
    }
    return withReissuedToken(updated, sid);
  },

  async setPassword(
    user: User,
    sid: string,
    input: { currentPassword?: string; newPassword: string },
  ) {
    const passwordError = validatePassword(input.newPassword);
    if (passwordError) throw new ValidationError(passwordError);

    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw new ValidationError('Current password is required.');
      }
      const valid = await comparePassword(input.currentPassword, user.passwordHash);
      if (!valid) throw new UnauthorizedError('Current password is incorrect.');
    }

    const updated = await updateUserById(user.id, {
      passwordHash: await hashPassword(input.newPassword),
      forcePasswordReset: false,
    });
    await AuthSessionService.revokeOthers(user.id, sid);
    return withReissuedToken(updated, sid);
  },
};
