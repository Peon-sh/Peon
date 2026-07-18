import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { resetPasswordSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = resetPasswordSchema.parse(await request.json());
  await AuthService.resetPassword(body);
  return ok({ message: 'Password updated. You can now sign in.' });
});
