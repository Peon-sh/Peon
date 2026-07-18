import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { prisma } from '@/lib/prisma';
import { ServerService } from '@/services/internal/server/server';
import { enqueue } from '@/lib/queue/sqs';
import { validateServerSchema } from '@/schemas/server.schema';

type Ctx = { params: Promise<{ serverId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);

  const json = await request.json().catch(() => ({}));
  const body = validateServerSchema.parse(json ?? {});
  const { installDocker, ...connection } = body;

  // Persist host/user/port/key from the form before queueing so the worker never
  // validates against a stale DB address.
  const hasConnectionUpdate = Object.values(connection).some((v) => v !== undefined);
  if (hasConnectionUpdate) {
    await ServerService.update(serverId, connection);
  }

  const sessionId = randomUUID();
  await prisma.serverOperationLog.create({
    data: { serverId, sessionId, operation: 'validate', message: 'Validation queued.' },
  });
  await enqueue({
    type: 'server.validate',
    serverId,
    installDocker: installDocker ?? true,
    sessionId,
  });
  return ok({ queued: true, sessionId });
});
