import type { NextRequest } from 'next/server';
import { created, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ serviceId: string; taskId: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId, taskId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  return created(await ServiceModule.runTask(serviceId, taskId));
});
