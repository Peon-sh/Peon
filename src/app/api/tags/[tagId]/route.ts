import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { TagService } from '@/services/internal/tags/tags';

type Ctx = { params: Promise<{ tagId: string }> };

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { tagId } = await params;
  await requireInfraAccess(await TagService.workspaceIdFor(tagId));
  await TagService.remove(tagId);
  return ok({ deleted: true });
});
