import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireInfraAccess, requireWorkspaceMember } from '@/lib/auth/access';
import { SourceService } from '@/services/internal/sources/sources';
import { createSourceSchema } from '@/schemas/sources.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceMember(workspaceId);
  return ok(await SourceService.list(workspaceId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  const body = createSourceSchema.parse(await request.json());
  return created(await SourceService.create(workspaceId, body));
});
