import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { PrivateKeyService } from '@/services/internal/privatekey/privatekey';
import { createPrivateKeySchema } from '@/schemas/server.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  return ok(await PrivateKeyService.list(workspaceId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  const body = createPrivateKeySchema.parse(await request.json());
  return created(await PrivateKeyService.create(workspaceId, body));
});
