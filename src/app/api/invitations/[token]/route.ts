import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';

type Ctx = { params: Promise<{ token: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  const ws = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });
  if (ws) {
    return ok({
      type: 'workspace' as const,
      email: ws.email,
      role: ws.role,
      status: ws.status,
      target: ws.workspace.name,
    });
  }
  const proj = await prisma.projectInvitation.findUnique({
    where: { token },
    include: { project: { select: { name: true } } },
  });
  if (proj) {
    return ok({
      type: 'project' as const,
      email: proj.email,
      role: proj.role,
      status: proj.status,
      target: proj.project.name,
    });
  }
  throw new NotFoundError('Invitation not found.');
});
