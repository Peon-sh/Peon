import type { User } from '@/lib/prisma';
import { generateJWT, type JWTPayload } from '@/lib/auth/jwt';
import { hashPassword, comparePassword, validatePassword } from '@/lib/auth/password';
import { resolveProfilePictureUrl } from '@/lib/auth/profile-picture';
import type { SessionRequestMeta } from '@/lib/auth/session-meta';
import { OTPService } from '@/services/internal/email/otp';
import { AuthSessionService } from '@/services/internal/auth/sessions';
import { createPersonalWorkspace } from '@/services/internal/workspace/provisioning';
import { verifyGoogleToken, normalizeGoogleUser } from '@/services/external/google/auth';
import {
  createUser,
  getUserByEmail,
  getUserByGoogleId,
  updateUserById,
  countUsers,
} from '@/services/internal/auth/users';
import { isInstanceOwnerEmail } from '@/lib/auth/instance-owner';
import { enqueueEmail } from '@/lib/email/enqueue';
import { welcomeEmailTemplate } from '@/lib/email/templates/welcome';
import { AppError, ConflictError, UnauthorizedError, ValidationError } from '@/lib/errors';

export interface AuthenticatedUser {
  user: {
    id: string;
    email: string;
    name: string | null;
    profilePicture: string | null;
    hasPassword: boolean;
    isInstanceAdmin: boolean;
    isInstanceOwner: boolean;
    isOnboarded: boolean;
  };
  token: string;
}

async function toPayload(user: User, sid: string): Promise<JWTPayload> {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isInstanceAdmin: user.isInstanceAdmin,
    isInstanceOwner: isInstanceOwnerEmail(user.email),
    isOnboarded: user.isOnboarded,
    profilePicture: await resolveProfilePictureUrl(user.profilePicture),
    sid,
  };
}

async function toPublicUser(user: User) {
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

async function issue(user: User, meta: SessionRequestMeta): Promise<AuthenticatedUser> {
  const session = await AuthSessionService.create(user.id, meta);
  const token = await generateJWT(await toPayload(user, session.id));
  return {
    token,
    user: await toPublicUser(user),
  };
}

/** Re-issue JWT for an existing session (profile updates, onboarding). */
export async function reissueToken(user: User, sid: string): Promise<string> {
  return generateJWT(await toPayload(user, sid));
}

async function sendWelcomeEmail(user: User): Promise<void> {
  try {
    const template = welcomeEmailTemplate(user.name);
    await enqueueEmail({ to: user.email, ...template });
  } catch (err) {
    console.error('Failed to enqueue welcome email:', err);
  }
}

export const AuthService = {
  /** Step 1 of signup: validate email is free and send an OTP. */
  async initiateSignup(email: string): Promise<void> {
    if (await getUserByEmail(email)) {
      throw new ConflictError('An account with this email already exists.');
    }
    await OTPService.generateAndSend(email, 'SIGNUP');
  },

  /** Step 2 of signup: verify OTP, create the user + personal workspace, log in. */
  async completeSignup(
    input: {
      email: string;
      name: string;
      password: string;
      code: string;
    },
    meta: SessionRequestMeta,
  ): Promise<AuthenticatedUser> {
    const passwordError = validatePassword(input.password);
    if (passwordError) throw new ValidationError(passwordError);

    if (await getUserByEmail(input.email)) {
      throw new ConflictError('An account with this email already exists.');
    }

    const valid = await OTPService.verify(input.email, 'SIGNUP', input.code);
    if (!valid) throw new UnauthorizedError('Invalid or expired verification code.');

    const isFirstUser = (await countUsers()) === 0;
    const user = await createUser({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: new Date(),
      isInstanceAdmin: isFirstUser,
    });
    await createPersonalWorkspace(user);
    await sendWelcomeEmail(user);
    return issue(user, meta);
  },

  async login(
    email: string,
    password: string,
    meta: SessionRequestMeta,
  ): Promise<AuthenticatedUser> {
    const user = await getUserByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password.');
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid email or password.');
    return issue(user, meta);
  },

  async loginWithGoogle(
    accessToken: string,
    meta: SessionRequestMeta,
  ): Promise<AuthenticatedUser> {
    const info = await verifyGoogleToken(accessToken);
    const normalized = normalizeGoogleUser(info);
    if (!normalized.email) throw new AppError('Google account has no email.');

    let user =
      (normalized.googleId ? await getUserByGoogleId(normalized.googleId) : null) ??
      (await getUserByEmail(normalized.email));

    if (user) {
      // Link Google id if missing.
      if (!user.googleId && normalized.googleId) {
        user = await updateUserById(user.id, {
          googleId: normalized.googleId,
          profilePicture: user.profilePicture ?? normalized.picture,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        });
      }
      return issue(user, meta);
    }

    const isFirstUser = (await countUsers()) === 0;
    user = await createUser({
      email: normalized.email,
      name: normalized.name,
      googleId: normalized.googleId,
      profilePicture: normalized.picture,
      emailVerifiedAt: new Date(),
      isInstanceAdmin: isFirstUser,
    });
    await createPersonalWorkspace(user);
    await sendWelcomeEmail(user);
    return issue(user, meta);
  },

  async resendOtp(email: string, purpose: 'SIGNUP' | 'RESET_PASSWORD'): Promise<void> {
    await OTPService.generateAndSend(email, purpose);
  },

  async forgotPassword(email: string): Promise<void> {
    const user = await getUserByEmail(email);
    // Do not leak existence; only send when the account exists.
    if (user) await OTPService.generateAndSend(email, 'RESET_PASSWORD');
  },

  async resetPassword(input: { email: string; code: string; newPassword: string }): Promise<void> {
    const passwordError = validatePassword(input.newPassword);
    if (passwordError) throw new ValidationError(passwordError);

    const valid = await OTPService.verify(input.email, 'RESET_PASSWORD', input.code);
    if (!valid) throw new UnauthorizedError('Invalid or expired verification code.');

    const user = await getUserByEmail(input.email);
    if (!user) throw new UnauthorizedError('Account not found.');
    await updateUserById(user.id, {
      passwordHash: await hashPassword(input.newPassword),
      forcePasswordReset: false,
    });
    await AuthSessionService.revokeAll(user.id);
  },
};
