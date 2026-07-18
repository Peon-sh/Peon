import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceRole } from '@/lib/auth/access';
import { WorkspaceService } from '@/services/internal/workspace/workspace';
import { updateMemberRoleSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ workspaceId: string; userId: string }> };

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId, userId } = await params;
  await requireWorkspaceRole(workspaceId, 'ADMIN');
  const body = updateMemberRoleSchema.parse(await request.json());
  return ok(await WorkspaceService.changeRole(workspaceId, userId, body.role));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId, userId } = await params;
  await requireWorkspaceRole(workspaceId, 'ADMIN');
  await WorkspaceService.removeMember(workspaceId, userId);
  return ok({ removed: true });
});
