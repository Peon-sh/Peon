import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { PrivateKeyService } from '@/services/internal/privatekey/privatekey';

type Ctx = { params: Promise<{ keyId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { keyId } = await params;
  const workspaceId = await PrivateKeyService.workspaceIdFor(keyId);
  await requireInfraAccess(workspaceId);
  const key = await PrivateKeyService.get(keyId);
  return ok({
    id: key.id,
    uuid: key.uuid,
    name: key.name,
    description: key.description,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
  });
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { keyId } = await params;
  const workspaceId = await PrivateKeyService.workspaceIdFor(keyId);
  await requireInfraAccess(workspaceId);
  await PrivateKeyService.remove(keyId);
  return ok({ deleted: true });
});
