import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireProjectAccess, requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { upsertVolumeSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serviceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectAccess(projectId);
  return ok(await ServiceModule.listVolumes(serviceId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const body = upsertVolumeSchema.parse(await request.json());
  return created(await ServiceModule.createVolume(serviceId, body));
});
