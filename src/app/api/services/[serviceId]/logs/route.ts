import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectAccess } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { ServiceRuntime } from '@/services/internal/service/runtime';

type Ctx = { params: Promise<{ serviceId: string }> };

export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectAccess(projectId);
  const tailParam = req.nextUrl.searchParams.get('tail');
  const all = req.nextUrl.searchParams.get('all') === 'true' || tailParam === '0';
  const tail = all ? 0 : Number(tailParam ?? 200) || 200;
  return ok(await ServiceRuntime.logs(serviceId, all ? { all: true } : { tail }));
});
