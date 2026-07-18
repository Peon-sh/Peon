import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceRole } from '@/lib/auth/access';
import { WorkspaceService } from '@/services/internal/workspace/workspace';

type Ctx = { params: Promise<{ workspaceId: string; invitationId: string }> };

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId, invitationId } = await params;
  const ctx = await requireWorkspaceRole(workspaceId, 'ADMIN');
  await WorkspaceService.revokeInvitation(workspaceId, invitationId, {
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
  });
  return ok({ revoked: true });
});
