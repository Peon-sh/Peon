import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { requireSession } from '@/lib/auth/context';
import { ServerService } from '@/services/internal/server/server';
import { mintTerminalTicket } from '@/lib/terminal/ticket';
import { terminalWsUrlForTicket } from '@/lib/terminal/ws-url';
import { serverEnv } from '@/lib/env';
import { z } from 'zod';

type Ctx = { params: Promise<{ serverId: string }> };

const bodySchema = z.object({
  cols: z.number().int().min(20).max(500).optional(),
  rows: z.number().int().min(10).max(200).optional(),
});

/**
 * Mint a short-lived ticket and WebSocket URL for an interactive SSH terminal.
 * The worker validates the ticket and opens a remote PTY.
 */
export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serverId } = await params;
  const session = await requireSession();
  const workspaceId = await ServerService.workspaceIdFor(serverId);
  await requireInfraAccess(workspaceId);

  const body = bodySchema.parse(await request.json().catch(() => ({})));
  const ticket = await mintTerminalTicket({
    kind: 'server',
    serverId,
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
