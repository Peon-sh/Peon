import { ok, route } from '@/lib/http/response';
import { requireSession } from '@/lib/auth/context';
import { AuthSessionService } from '@/services/internal/auth/sessions';

export const GET = route(async () => {
  const session = await requireSession();
  const sessions = await AuthSessionService.listActive(session.userId, session.sid ?? null);
  return ok({ sessions });
});
