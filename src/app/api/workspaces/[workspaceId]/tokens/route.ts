import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { TokenService } from '@/services/internal/token/token';
import { createTokenSchema } from '@/schemas/server.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceMember(workspaceId);
  return ok(await TokenService.list(workspaceId, ctx.user.id));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  const ctx = await requireWorkspaceMember(workspaceId);
  const body = createTokenSchema.parse(await request.json());
  return created(await TokenService.create(workspaceId, ctx.user.id, body));
});
