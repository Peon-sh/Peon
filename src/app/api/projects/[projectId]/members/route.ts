import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireProjectAccess, requireProjectManage } from '@/lib/auth/access';
import { ProjectService } from '@/services/internal/project/project';
import { addProjectMemberSchema } from '@/schemas/workspace.schema';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  await requireProjectAccess(projectId);
  return ok(await ProjectService.listMembers(projectId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  const access = await requireProjectManage(projectId);
  const body = addProjectMemberSchema.parse(await request.json());
  return created(
    await ProjectService.addMember(projectId, access.workspaceId, body.userId, body.role),
  );
});
