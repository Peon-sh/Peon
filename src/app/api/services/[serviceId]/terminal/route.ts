import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { requireSession } from '@/lib/auth/context';
import { ServiceModule } from '@/services/internal/service/service';
import { ServiceRuntime } from '@/services/internal/service/runtime';
import { mintTerminalTicket } from '@/lib/terminal/ticket';
import { terminalWsUrlForTicket } from '@/lib/terminal/ws-url';
import { serverEnv } from '@/lib/env';
import { z } from 'zod';

type Ctx = { params: Promise<{ serviceId: string }> };

const bodySchema = z.object({
  cols: z.number().int().min(20).max(500).optional(),
  rows: z.number().int().min(10).max(200).optional(),
});

/**
 * Mint a short-lived ticket and WebSocket URL for an interactive container shell
 * (`docker exec -it` over SSH via the worker terminal server).
 */
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const session = await requireSession();
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);

  // Fail early if the container / SSH target cannot be resolved.
  await ServiceRuntime.resolveContainer(serviceId);

  const body = bodySchema.parse(await request.json().catch(() => ({})));
  const ticket = await mintTerminalTicket({
    kind: 'service',
    serviceId,
    userId: session.userId,
    cols: body.cols,
    rows: body.rows,
  });

  return ok({
    ticket,
    wsUrl: terminalWsUrlForTicket(ticket),
    port: serverEnv().TERMINAL_WS_PORT,
  });
});
