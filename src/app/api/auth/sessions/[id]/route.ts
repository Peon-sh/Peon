import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireSession } from '@/lib/auth/context';
import { clearAuthCookie } from '@/lib/auth/cookies';
import { AuthSessionService } from '@/services/internal/auth/sessions';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_request: NextRequest, { params }: Ctx) => {
  const session = await requireSession();
  const { id } = await params;
  await AuthSessionService.revoke(session.userId, id);
  if (id === session.sid) {
    await clearAuthCookie();
  }
  return ok({ revoked: true });
});
