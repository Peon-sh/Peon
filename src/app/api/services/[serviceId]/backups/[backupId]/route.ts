import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { BackupModule } from '@/services/internal/backup/module';
import { upsertBackupSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serviceId: string; backupId: string }> };

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId, backupId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const body = upsertBackupSchema.partial().parse(await request.json());
  return ok(await BackupModule.update(serviceId, backupId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId, backupId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  await BackupModule.remove(serviceId, backupId);
  return ok({ deleted: true });
});
