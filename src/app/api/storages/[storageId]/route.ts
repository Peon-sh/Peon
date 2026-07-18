import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess, requireWorkspaceMember } from '@/lib/auth/access';
import { StorageService } from '@/services/internal/storages/storages';
import { updateStorageSchema } from '@/schemas/storages.schema';

type Ctx = { params: Promise<{ storageId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { storageId } = await params;
  await requireWorkspaceMember(await StorageService.workspaceIdFor(storageId));
  return ok(await StorageService.get(storageId));
});

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { storageId } = await params;
  await requireInfraAccess(await StorageService.workspaceIdFor(storageId));
  const body = updateStorageSchema.parse(await request.json());
  return ok(await StorageService.update(storageId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { storageId } = await params;
  await requireInfraAccess(await StorageService.workspaceIdFor(storageId));
  await StorageService.remove(storageId);
  return ok({ deleted: true });
});
