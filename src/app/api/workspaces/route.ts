import type { NextRequest } from 'next/server';
import { ok, created, route } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { WorkspaceService } from '@/services/internal/workspace/workspace';
import { createWorkspaceSchema } from '@/schemas/workspace.schema';

export const GET = route(async () => {
  const user = await requireUser();
  return ok(await WorkspaceService.listForUser(user.id));
});

export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const body = createWorkspaceSchema.parse(await request.json());
  return created(await WorkspaceService.create(user.id, body));
});
