import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess, requireWorkspaceMember } from '@/lib/auth/access';
import { SourceService } from '@/services/internal/sources/sources';
import {
  updateGithubSourceSchema,
  updateGitlabSourceSchema,
} from '@/schemas/sources.schema';

type Ctx = { params: Promise<{ sourceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { sourceId } = await params;
  const { workspaceId } = await SourceService.resolve(sourceId);
  await requireWorkspaceMember(workspaceId);
  return ok(await SourceService.get(sourceId));
});

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const { sourceId } = await params;
  const { provider, workspaceId } = await SourceService.resolve(sourceId);
  await requireInfraAccess(workspaceId);
  const json = await request.json();
  const body =
    provider === 'github'
      ? updateGithubSourceSchema.parse(json)
      : updateGitlabSourceSchema.parse(json);
  return ok(await SourceService.update(sourceId, body));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { sourceId } = await params;
  const { workspaceId } = await SourceService.resolve(sourceId);
  await requireInfraAccess(workspaceId);
  await SourceService.remove(sourceId);
  return ok({ deleted: true });
});
