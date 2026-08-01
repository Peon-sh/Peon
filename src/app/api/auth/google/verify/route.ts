import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { setAuthCookie } from '@/lib/auth/cookies';
import { extractSessionMeta } from '@/lib/auth/session-meta';
import { googleVerifySchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = googleVerifySchema.parse(await request.json());
  const meta = extractSessionMeta(request.headers);
  const result = await AuthService.loginWithGoogle(body.accessToken, meta, body.attribution);
  await setAuthCookie(result.token);
  return ok(result);
});
