import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectAccess, requireProjectManage, requireProjectDelete } from '@/lib/auth/access';
import { ProjectService } from '@/services/internal/project/project';
import { updateProjectSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  const access = await requireProjectAccess(projectId);
  const project = await ProjectService.get(projectId);
  return ok({ project, canManage: access.canManage, role: access.role });
});

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  await requireProjectManage(projectId);
  const body = updateProjectSchema.parse(await request.json());
  return ok(await ProjectService.update(projectId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  await requireProjectDelete(projectId);
  await ProjectService.remove(projectId);
  return ok({ deleted: true });
});
