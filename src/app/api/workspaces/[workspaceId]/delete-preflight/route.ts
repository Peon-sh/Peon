import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceRole } from '@/lib/auth/access';
import { WorkspaceService } from '@/services/internal/workspace/workspace';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceRole(workspaceId, 'OWNER');
  return ok(await WorkspaceService.deletePreflight(workspaceId));
});
