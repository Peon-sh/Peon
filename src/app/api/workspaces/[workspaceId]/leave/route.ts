import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { WorkspaceService } from '@/services/internal/workspace/workspace';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceMember(workspaceId);
  await WorkspaceService.leave(workspaceId, ctx.user.id);
  return ok({ left: true });
});
