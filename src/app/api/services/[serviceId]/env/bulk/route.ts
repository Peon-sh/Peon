import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ serviceId: string }> };

const bulkSchema = z.object({
  raw: z.string().max(200_000),
  isPreview: z.boolean().optional(),
});

/** Developer-mode bulk replace of the production or preview env var set. */
export const PUT = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const { raw, isPreview } = bulkSchema.parse(await request.json());
  return ok(await ServiceModule.bulkSaveEnv(serviceId, raw, { isPreview }));
});
