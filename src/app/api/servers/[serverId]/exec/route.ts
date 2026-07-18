import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { ServerService } from '@/services/internal/server/server';
import { ServerRuntime } from '@/services/internal/server/runtime';
import { execCommandSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serverId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  const body = execCommandSchema.parse(await request.json());
  return ok(await ServerRuntime.exec(serverId, body.command));
});
