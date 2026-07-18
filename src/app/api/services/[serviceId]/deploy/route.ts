import type { NextRequest } from 'next/server';
import { created, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { deployOptsSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serviceId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  const access = await requireProjectManage(projectId);
  const body = deployOptsSchema.parse(await request.json().catch(() => ({})));
  return created(await ServiceModule.deploy(serviceId, access.user.id, body));
});
