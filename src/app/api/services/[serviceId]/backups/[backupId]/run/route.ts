import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { BackupModule } from '@/services/internal/backup/module';

type Ctx = { params: Promise<{ serviceId: string; backupId: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId, backupId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  return ok(await BackupModule.runNow(serviceId, backupId));
});
