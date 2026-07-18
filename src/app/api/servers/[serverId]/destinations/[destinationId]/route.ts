import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { ServerService } from '@/services/internal/server/server';

type Ctx = { params: Promise<{ serverId: string; destinationId: string }> };

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { destinationId } = await params;
  const serverId = await ServerService.destinationServerId(destinationId);
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  await ServerService.removeDestination(destinationId);
  return ok({ deleted: true });
});
