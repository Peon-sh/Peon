import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireSession, requireUser } from '@/lib/auth/context';
import { setAuthCookie } from '@/lib/auth/cookies';
import { changePasswordSchema } from '@/schemas/auth.schema';
import { ProfileService } from '@/services/internal/auth/profile';

export const POST = route(async (request: NextRequest) => {
  const session = await requireSession();
  const user = await requireUser();
  const body = changePasswordSchema.parse(await request.json());
  const result = await ProfileService.setPassword(user, session.sid!, body);
  await setAuthCookie(result.token);
  return ok(result);
});
