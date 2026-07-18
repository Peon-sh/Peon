import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { AuthService } from '@/services/internal/auth/auth';
import { resendOtpSchema } from '@/schemas/auth.schema';

export const POST = route(async (request: NextRequest) => {
  const body = resendOtpSchema.parse(await request.json());
  await AuthService.resendOtp(body.email, body.purpose);
  return ok({ message: 'Verification code resent.' });
});
