import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { assertAuthRateLimit } from '@/lib/auth/auth-rate-limit';
import { resetPasswordSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = resetPasswordSchema.parse(await request.json());
  assertAuthRateLimit('reset-password', request.headers, body.email);
  await AuthService.resetPassword(body);
  return ok({ message: 'Password updated. You can now sign in.' });
});
