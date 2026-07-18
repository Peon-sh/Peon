import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { signupInitiateSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = signupInitiateSchema.parse(await request.json());
  await AuthService.initiateSignup(body.email);
  return ok({ message: 'Verification code sent to your email.' });
});
