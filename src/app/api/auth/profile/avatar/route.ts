import { ok, route } from '@/lib/http/response';
import { requireSession, requireUser } from '@/lib/auth/context';
import { setAuthCookie } from '@/lib/auth/cookies';
import { ProfileService } from '@/services/internal/auth/profile';

export const DELETE = route(async () => {
  const session = await requireSession();
  const user = await requireUser();
  const result = await ProfileService.removeAvatar(user, session.sid!);
  await setAuthCookie(result.token);
  return ok(result);
});
