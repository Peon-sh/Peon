import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { prisma } from '@/lib/prisma';
import { ServerService } from '@/services/internal/server/server';

type Ctx = { params: Promise<{ serverId: string }> };

export const GET = route(async (_request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);

  const latest = await prisma.serverOperationLog.findFirst({
    where: { serverId },
    orderBy: { createdAt: 'desc' },
  });

  if (!latest) return ok([]);

  const logs = await prisma.serverOperationLog.findMany({
    where: latest.sessionId
      ? { serverId, sessionId: latest.sessionId }
      : { serverId, sessionId: null },
    orderBy: { createdAt: 'asc' },
    take: 80,
  });

  return ok(logs);
});
