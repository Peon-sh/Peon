import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { accessibleProjectIds, requireWorkspaceMember } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ workspaceId: string }> };

/** Active (QUEUED / IN_PROGRESS) deployments across accessible projects. */
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceMember(workspaceId);
  const projectIds = await accessibleProjectIds(workspaceId, ctx.user.id, ctx.role);
  return ok(await ServiceModule.listActiveDeployments(workspaceId, projectIds));
});
