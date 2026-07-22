import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireProjectDelete, requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ serviceId: string; webhookId: string }> };

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId, webhookId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectDelete(projectId);
  await ServiceModule.deleteWebhook(serviceId, webhookId);
  return ok({ deleted: true });
});
