import { ok, route } from '@/lib/http/response';
import { requireSession } from '@/lib/auth/context';
import { clearAuthCookie } from '@/lib/auth/cookies';
import { AuthSessionService } from '@/services/internal/auth/sessions';

export const POST = route(async () => {
  const session = await requireSession().catch(() => null);
  if (session?.sid) {
    try {
      await AuthSessionService.revoke(session.userId, session.sid);
    } catch {
      // Session may already be gone.
    }
  }
  await clearAuthCookie();
  return ok({ message: 'Logged out.' });
});
