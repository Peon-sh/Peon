import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireInfraAccess, requireWorkspaceMember } from '@/lib/auth/access';
import { TagService } from '@/services/internal/tags/tags';
import { createTagSchema } from '@/schemas/tags.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceMember(workspaceId);
  return ok(await TagService.list(workspaceId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  const body = createTagSchema.parse(await request.json());
  return created(await TagService.create(workspaceId, body));
});
