import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireProjectAccess, requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { createServiceSchema } from '@/schemas/service.schema';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  await requireProjectAccess(projectId);
  return ok(await ServiceModule.listByProject(projectId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  await requireProjectManage(projectId);
  const body = createServiceSchema.parse(await request.json());
  return created(await ServiceModule.create(projectId, body));
});
