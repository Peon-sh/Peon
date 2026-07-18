import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { avatarPresignSchema } from '@/schemas/auth.schema';
import { ProfileService } from '@/services/internal/auth/profile';

export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const body = avatarPresignSchema.parse(await request.json());
  const result = await ProfileService.presignAvatar(user, body.contentType);
  return ok(result);
});
