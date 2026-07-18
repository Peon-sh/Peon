import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { SourceService } from '@/services/internal/sources/sources';

type Ctx = { params: Promise<{ sourceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { sourceId } = await params;
  const { workspaceId } = await SourceService.resolve(sourceId);
  await requireWorkspaceMember(workspaceId);
  return ok(await SourceService.listResources(sourceId));
});
