import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { forgotPasswordSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = forgotPasswordSchema.parse(await request.json());
  await AuthService.forgotPassword(body.email);
  return ok({ message: 'If an account exists, a reset code has been sent.' });
});
