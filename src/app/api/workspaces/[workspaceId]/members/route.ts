import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/auth/access';
import { WorkspaceService } from '@/services/internal/workspace/workspace';
import { inviteWorkspaceMemberSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceMember(workspaceId);
  const [members, invitations] = await Promise.all([
    WorkspaceService.listMembers(workspaceId),
    WorkspaceService.listInvitations(workspaceId),
  ]);
  return ok({ members, invitations });
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceRole(workspaceId, 'ADMIN');
  const body = inviteWorkspaceMemberSchema.parse(await request.json());
  return created(await WorkspaceService.invite(workspaceId, ctx.user.id, body));
});
