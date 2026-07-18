import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceRole } from '@/lib/auth/access';
import { AuditService } from '@/services/internal/audit/audit';
import { listAuditSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceRole(workspaceId, 'OWNER');

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const query = listAuditSchema.parse(raw);

  const result = await AuditService.list({
    workspaceId,
    cursor: query.cursor,
    limit: query.limit,
    action: query.action,
    actorUserId: query.actorUserId,
    resourceType: query.resourceType,
    resourceId: query.resourceId,
    q: query.q,
    from: query.from ? new Date(query.from) : null,
    to: query.to ? new Date(query.to) : null,
  });

  return ok(result);
});
