import { requireUser } from '@/lib/auth/context';
import { serverEnv } from '@/lib/env';
import { ForbiddenError } from '@/lib/errors';

/** True when the email matches INSTANCE_OWNER_EMAIL (case-insensitive). */
export function isInstanceOwnerEmail(email: string): boolean {
  const owner = serverEnv().INSTANCE_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  return email.trim().toLowerCase() === owner;
}

export async function requireInstanceOwner() {
  const user = await requireUser();
  if (!isInstanceOwnerEmail(user.email)) {
    throw new ForbiddenError('Only the instance owner can manage instance settings.');
  }
  return user;
}
