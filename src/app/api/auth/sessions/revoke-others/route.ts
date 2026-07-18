import { ok, route } from '@/lib/http/response';
import { requireSession } from '@/lib/auth/context';
import { AuthSessionService } from '@/services/internal/auth/sessions';

export const POST = route(async () => {
  const session = await requireSession();
  const count = await AuthSessionService.revokeOthers(session.userId, session.sid!);
  return ok({ revoked: count });
});
