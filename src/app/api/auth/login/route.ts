import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { setAuthCookie } from '@/lib/auth/cookies';
import { extractSessionMeta } from '@/lib/auth/session-meta';
import { loginSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = loginSchema.parse(await request.json());
  const meta = extractSessionMeta(request.headers);
  const result = await AuthService.login(body.email, body.password, meta);
  const { token, ...data } = result;
  await setAuthCookie(token);
  return ok(data);
});
