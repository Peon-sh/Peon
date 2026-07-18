import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireInfraAccess, requireWorkspaceMember } from '@/lib/auth/access';
import { SharedVariableService } from '@/services/internal/shared-variables/shared-variables';
import { createSharedVariableSchema } from '@/schemas/shared-variables.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceMember(workspaceId);
  return ok(await SharedVariableService.list(workspaceId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  const body = createSharedVariableSchema.parse(await request.json());
  return created(await SharedVariableService.create(workspaceId, body));
});
