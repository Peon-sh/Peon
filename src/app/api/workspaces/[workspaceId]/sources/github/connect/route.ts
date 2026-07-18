import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { SourceService } from '@/services/internal/sources/sources';

type Ctx = { params: Promise<{ workspaceId: string }> };

/** Start platform GitHub App install — returns GitHub install URL with signed state. */
export const POST = route(async (_request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireInfraAccess(workspaceId);
  return ok(await SourceService.startPlatformConnect(workspaceId, ctx.user.id));
});
