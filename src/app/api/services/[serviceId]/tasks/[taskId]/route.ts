import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { upsertTaskSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serviceId: string; taskId: string }> };

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId, taskId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const body = upsertTaskSchema.partial().parse(await request.json());
  return ok(await ServiceModule.updateTask(serviceId, taskId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId, taskId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  await ServiceModule.deleteTask(serviceId, taskId);
  return ok({ deleted: true });
});
