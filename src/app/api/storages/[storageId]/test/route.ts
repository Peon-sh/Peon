import type { NextRequest } from 'next/server';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { StorageService } from '@/services/internal/storages/storages';
import { s3ClientFor } from '@/services/external/s3/client';

type Ctx = { params: Promise<{ storageId: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { storageId } = await params;
  await requireInfraAccess(await StorageService.workspaceIdFor(storageId));
  const storage = await StorageService.getRaw(storageId);
  try {
    const client = s3ClientFor(storage);
    await client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
    await StorageService.markTested(storageId);
    return ok({ reachable: true });
  } catch (err) {
    await StorageService.markTested(storageId);
    return ok({ reachable: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});
