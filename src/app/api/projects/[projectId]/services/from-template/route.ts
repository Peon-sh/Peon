import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { created, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ projectId: string }> };

const fromTemplateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  serverId: z.string().min(1),
  destinationId: z.string().optional(),
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { projectId } = await params;
  await requireProjectManage(projectId);
  const body = fromTemplateSchema.parse(await request.json());
  return created(await ServiceModule.createFromTemplate(projectId, body));
});
