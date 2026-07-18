import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireProjectAccess, requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { upsertEnvSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ serviceId: string }> };

export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  const reveal = req.nextUrl.searchParams.get('reveal') === 'true';
  // Revealing decrypted values requires manage-level access.
  if (reveal) await requireProjectManage(projectId);
  else await requireProjectAccess(projectId);
  return ok(await ServiceModule.listEnv(serviceId, { reveal }));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const body = upsertEnvSchema.parse(await request.json());
  return created(await ServiceModule.upsertEnv(serviceId, body));
});
