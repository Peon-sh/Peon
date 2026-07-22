import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectDelete, requireProjectManage } from '@/lib/auth/access';
import { ProjectService } from '@/services/internal/project/project';
import { updateProjectMemberRoleSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ projectId: string; userId: string }> };

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { projectId, userId } = await params;
  await requireProjectManage(projectId);
  const body = updateProjectMemberRoleSchema.parse(await request.json());
  return ok(await ProjectService.changeRole(projectId, userId, body.role));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { projectId, userId } = await params;
  await requireProjectDelete(projectId);
  await ProjectService.removeMember(projectId, userId);
  return ok({ removed: true });
});
