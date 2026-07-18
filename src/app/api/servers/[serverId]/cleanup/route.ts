import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { prisma } from '@/lib/prisma';
import { ServerService } from '@/services/internal/server/server';
import { enqueue } from '@/lib/queue/sqs';

type Ctx = { params: Promise<{ serverId: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  const sessionId = randomUUID();
  await prisma.serverOperationLog.create({
    data: { serverId, sessionId, operation: 'cleanup', message: 'Cleanup queued.' },
  });
  await enqueue({ type: 'server.cleanup', serverId, sessionId });
  return ok({ queued: true, sessionId });
});
