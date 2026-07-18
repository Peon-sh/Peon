import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { SharedVariableService } from '@/services/internal/shared-variables/shared-variables';
import { updateSharedVariableSchema } from '@/schemas/shared-variables.schema';

type Ctx = { params: Promise<{ variableId: string }> };

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { variableId } = await params;
  await requireInfraAccess(await SharedVariableService.workspaceIdFor(variableId));
  const body = updateSharedVariableSchema.parse(await request.json());
  return ok(await SharedVariableService.update(variableId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { variableId } = await params;
  await requireInfraAccess(await SharedVariableService.workspaceIdFor(variableId));
  await SharedVariableService.remove(variableId);
  return ok({ deleted: true });
});
