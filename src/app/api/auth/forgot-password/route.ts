import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { assertAuthRateLimit } from '@/lib/auth/auth-rate-limit';
import { forgotPasswordSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = forgotPasswordSchema.parse(await request.json());
  assertAuthRateLimit('forgot-password', request.headers, body.email);
  await AuthService.forgotPassword(body.email);
  return ok({ message: 'If an account exists, a reset code has been sent.' });
});
