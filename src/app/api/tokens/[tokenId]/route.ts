import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { ForbiddenError } from '@/lib/errors';
import { TokenService } from '@/services/internal/token/token';

type Ctx = { params: Promise<{ tokenId: string }> };

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { tokenId } = await params;
  const owner = await TokenService.ownerFor(tokenId);
  const ctx = await requireWorkspaceMember(owner.workspaceId);
  if (owner.userId !== ctx.user.id) {
    throw new ForbiddenError('You can only manage your own tokens.');
  }
  await TokenService.remove(tokenId);
  return ok({ deleted: true });
});
