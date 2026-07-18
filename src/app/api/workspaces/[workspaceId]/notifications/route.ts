import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess, requireWorkspaceMember } from '@/lib/auth/access';
import { NotificationService } from '@/services/internal/notifications/notifications';
import { upsertChannelSchema } from '@/schemas/notifications.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceMember(workspaceId);
  return ok(await NotificationService.list(workspaceId));
});

export const PUT = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  const body = upsertChannelSchema.parse(await request.json());
  return ok(await NotificationService.upsert(workspaceId, body));
});
