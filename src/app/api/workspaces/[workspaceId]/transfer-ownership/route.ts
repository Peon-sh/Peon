import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceRole } from '@/lib/auth/access';
import { WorkspaceService } from '@/services/internal/workspace/workspace';
import { transferOwnershipSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceRole(workspaceId, 'OWNER');
  const body = transferOwnershipSchema.parse(await request.json());
  return ok(await WorkspaceService.transferOwnership(workspaceId, ctx.user.id, body));
});
