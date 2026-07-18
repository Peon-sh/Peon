import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/auth/access';
import { WorkspaceService } from '@/services/internal/workspace/workspace';
import { updateWorkspaceSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceMember(workspaceId);
  const members = await WorkspaceService.listMembers(workspaceId);
  return ok({ role: ctx.role, members });
});

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceRole(workspaceId, 'ADMIN');
  const body = updateWorkspaceSchema.parse(await request.json());
  return ok(await WorkspaceService.update(workspaceId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceRole(workspaceId, 'OWNER');
  await WorkspaceService.remove(workspaceId);
  return ok({ deleted: true });
});
