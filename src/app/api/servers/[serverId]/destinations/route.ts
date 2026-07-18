import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { ServerService } from '@/services/internal/server/server';
import { createDestinationSchema } from '@/schemas/server.schema';

type Ctx = { params: Promise<{ serverId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  return ok(await ServerService.listDestinations(serverId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  const body = createDestinationSchema.parse(await request.json());
  return created(await ServerService.createDestination(serverId, body));
});
