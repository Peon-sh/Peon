import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/auth/access';
import { ProjectService } from '@/services/internal/project/project';
import { createProjectSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceMember(workspaceId);
  return ok(await ProjectService.listAccessible(workspaceId, ctx.user.id, ctx.role));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceRole(workspaceId, 'ADMIN');
  const body = createProjectSchema.parse(await request.json());
  return created(await ProjectService.create(workspaceId, ctx.user.id, body));
});
