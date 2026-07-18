import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { controlSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serviceId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const { action } = controlSchema.parse(await request.json());
  return ok(await ServiceModule.control(serviceId, action));
});
