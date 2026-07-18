import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ deploymentId: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { deploymentId } = await params;
  const deployment = await ServiceModule.getDeployment(deploymentId);
  await requireProjectManage(deployment.service.projectId);
  return ok(await ServiceModule.cancelDeployment(deploymentId));
});
