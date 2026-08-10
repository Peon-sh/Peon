import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireSession, requireUser } from '@/lib/auth/context';
import { setAuthCookie } from '@/lib/auth/cookies';
import { updateProfileSchema } from '@/schemas/auth.schema';
import { ProfileService } from '@/services/internal/auth/profile';

export const PATCH = route(async (request: NextRequest) => {
  const session = await requireSession();
  const user = await requireUser();
  const body = updateProfileSchema.parse(await request.json());
  const result = await ProfileService.updateName(user, session.sid!, body.name);
  const { token, ...data } = result;
  await setAuthCookie(token);
  return ok(data);
});
