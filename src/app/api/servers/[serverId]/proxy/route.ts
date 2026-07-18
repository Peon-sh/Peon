import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { prisma } from '@/lib/prisma';
import { ServerService } from '@/services/internal/server/server';
import { enqueue } from '@/lib/queue/sqs';
import { proxyActionSchema } from '@/schemas/server.schema';

type Ctx = { params: Promise<{ serverId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);
  const { action } = proxyActionSchema.parse(await request.json());
  const sessionId = randomUUID();
  await prisma.serverOperationLog.create({
    data: { serverId, sessionId, operation: `proxy.${action}`, message: `Proxy ${action} queued.` },
  });
  await enqueue({ type: 'proxy', serverId, action, sessionId });
  return ok({ queued: true, sessionId });
});
