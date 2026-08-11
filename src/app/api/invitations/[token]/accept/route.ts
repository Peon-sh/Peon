import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth/context';
import { WorkspaceService } from '@/services/internal/workspace/workspace';
import { ProjectService } from '@/services/internal/project/project';
import { NotFoundError } from '@/lib/errors';

type Ctx = { params: Promise<{ token: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  const user = await requireUser();

  const ws = await prisma.workspaceInvitation.findUnique({ where: { token } });
  if (ws) {
    const workspaceId = await WorkspaceService.acceptInvitation(token, user);
    return ok({ type: 'workspace', workspaceId });
  }
  const proj = await prisma.projectInvitation.findUnique({ where: { token } });
  if (proj) {
    const projectId = await ProjectService.acceptInvitation(token, user);
    return ok({ type: 'project', projectId, workspaceId: proj.workspaceId });
  }
  throw new NotFoundError('Invitation not found.');
});
