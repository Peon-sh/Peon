import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { ServerService } from '@/services/internal/server/server';
import { ServerRuntime } from '@/services/internal/server/runtime';

type Ctx = { params: Promise<{ serverId: string }> };

/** Pre-establish SSH pool connection so subsequent exec commands are faster. */
export const POST = route(async (_request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  return ok(await ServerRuntime.warm(serverId));
});
