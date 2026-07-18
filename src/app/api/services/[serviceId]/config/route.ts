import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';

type Ctx = { params: Promise<{ serviceId: string }> };

// Reveals decrypted credentials, so both verbs require manage access.
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  return ok(await ServiceModule.getServiceConfig(serviceId));
});

const patchSchema = z.record(z.string(), z.string());

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);
  const values = patchSchema.parse(await request.json());
  await ServiceModule.updateServiceConfig(serviceId, values);
  return ok({ saved: true });
});
