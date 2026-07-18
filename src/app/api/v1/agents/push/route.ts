import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { agentPushSchema } from '@/schemas/agent-push.schema';
import { applyAgentPush } from '@/services/internal/server/agent';

/**
 * Public peon-ping-pong push endpoint.
 * Auth: Authorization: Bearer <server sentinel token>
 */
export const POST = route(async (req: NextRequest) => {
  const body = agentPushSchema.parse(await req.json());
  const result = await applyAgentPush(req.headers.get('authorization'), body);
  return ok({ message: 'ok', serverId: result.serverId });
});
