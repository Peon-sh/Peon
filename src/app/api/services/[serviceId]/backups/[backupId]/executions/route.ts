import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectAccess } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { BackupModule } from '@/services/internal/backup/module';

type Ctx = { params: Promise<{ serviceId: string; backupId: string }> };

export const GET = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId, backupId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectAccess(projectId);

  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : 5;
  const cursor = request.nextUrl.searchParams.get('cursor');

  return ok(
    await BackupModule.listExecutions(serviceId, backupId, {
      limit: Number.isFinite(limit) ? limit : 5,
      cursor,
    }),
  );
});
