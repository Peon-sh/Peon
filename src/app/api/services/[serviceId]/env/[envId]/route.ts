import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectDelete } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ serviceId: string; envId: string }> };

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId, envId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectDelete(projectId);
  await ServiceModule.deleteEnv(serviceId, envId);
  return ok({ deleted: true });
});
