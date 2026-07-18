import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { ServiceRuntime } from '@/services/internal/service/runtime';

type Ctx = { params: Promise<{ serviceId: string }> };

/** Pre-establish SSH pool connection so subsequent exec commands are faster. */
export const POST = route(async (_request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  return ok(await ServiceRuntime.warm(serviceId));
});
