import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { ServerService } from '@/services/internal/server/server';
import { updateServerSchema, deleteServerSchema } from '@/schemas/server.schema';

type Ctx = { params: Promise<{ serverId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  return ok(await ServerService.get(serverId));
});

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  const body = updateServerSchema.parse(await request.json());
  return ok(await ServerService.update(serverId, body));
});

export const DELETE = route(async (request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  const body = deleteServerSchema.parse(await request.json().catch(() => ({})));
  await ServerService.remove(serverId, body);
  return ok({ deleted: true });
});
