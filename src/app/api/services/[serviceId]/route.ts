import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectAccess, requireProjectManage, requireProjectDelete } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { updateServiceSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serviceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectAccess(projectId);
  return ok(await ServiceModule.get(serviceId));
});

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const body = updateServiceSchema.parse(await request.json());
  return ok(await ServiceModule.update(serviceId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectDelete(projectId);
  await ServiceModule.remove(serviceId);
  return ok({ deleted: true });
});
