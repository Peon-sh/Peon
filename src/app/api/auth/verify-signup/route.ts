import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { setAuthCookie } from '@/lib/auth/cookies';
import { extractSessionMeta } from '@/lib/auth/session-meta';
import { signupCompleteSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = signupCompleteSchema.parse(await request.json());
  const meta = extractSessionMeta(request.headers);
  const result = await AuthService.completeSignup(body, meta);
  const { token, ...data } = result;
  await setAuthCookie(token);
  return ok(data);
});
