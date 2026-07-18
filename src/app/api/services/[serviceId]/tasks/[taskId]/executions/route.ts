import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectAccess } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ serviceId: string; taskId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId, taskId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectAccess(projectId);
  return ok(await ServiceModule.listTaskExecutions(serviceId, taskId));
});
