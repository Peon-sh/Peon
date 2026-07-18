import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { listGithubInstallationRepos, resolveGithubAuth } from '@/lib/github/app';
import { SourceService } from '@/services/internal/sources/sources';

type Ctx = { params: Promise<{ sourceId: string }> };

export const GET = route(async (_request: NextRequest, { params }: Ctx) => {
  const { sourceId } = await params;
  const { provider, workspaceId } = await SourceService.resolve(sourceId);
  await requireInfraAccess(workspaceId);
  if (provider !== 'github') throw new NotFoundError('GitHub source not found.');

  const app = await prisma.githubApp.findUnique({
    where: { id: sourceId },
    include: { privateKey: true },
  });
  if (!app) throw new NotFoundError('GitHub source not found.');

  return ok(await listGithubInstallationRepos(resolveGithubAuth(app)));
});
