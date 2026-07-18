import { getCurrentAuth } from '@/lib/auth/cookies';
import type { JWTPayload } from '@/lib/auth/jwt';
import { getUserById } from '@/services/internal/auth/users';
import { UnauthorizedError } from '@/lib/errors';
import type { User } from '@/lib/prisma';

/** Returns the JWT payload for the current request, or null. */
export async function getSession(): Promise<JWTPayload | null> {
  return getCurrentAuth();
}

/** Returns the JWT payload or throws 401. Requires active AuthSession sid. */
export async function requireSession(): Promise<JWTPayload> {
  const session = await getCurrentAuth();
  if (!session?.sid) throw new UnauthorizedError();
  return session;
}

/** Loads the fresh User row for the current request, or throws 401. */
export async function requireUser(): Promise<User> {
  const session = await requireSession();
  const user = await getUserById(session.userId);
  if (!user) throw new UnauthorizedError();
  return user;
}
