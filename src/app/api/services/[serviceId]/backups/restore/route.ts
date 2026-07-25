import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { BackupModule } from '@/services/internal/backup/module';

type Ctx = { params: Promise<{ serviceId: string }> };

const restoreSchema = z.object({ filename: z.string().min(1) });

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const { filename } = restoreSchema.parse(await request.json());
  return ok(await BackupModule.queueRestore(serviceId, filename));
});
