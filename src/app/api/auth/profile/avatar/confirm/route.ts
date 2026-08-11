import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireSession, requireUser } from '@/lib/auth/context';
import { setAuthCookie } from '@/lib/auth/cookies';
import { avatarConfirmSchema } from '@/schemas/auth.schema';
import { ProfileService } from '@/services/internal/auth/profile';

export const POST = route(async (request: NextRequest) => {
  const session = await requireSession();
  const user = await requireUser();
  const body = avatarConfirmSchema.parse(await request.json());
  const result = await ProfileService.confirmAvatar(user, session.sid!, body.key);
  const { token, ...data } = result;
  await setAuthCookie(token);
  return ok(data);
});
