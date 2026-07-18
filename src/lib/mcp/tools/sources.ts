import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { SourceService } from '@/services/internal/sources/sources';
import {
  listGithubBranches,
  listGithubInstallationRepos,
  resolveGithubAuth,
} from '@/lib/github/app';
import {
  createSourceSchema,
  updateGithubSourceSchema,
  updateGitlabSourceSchema,
} from '@/schemas/sources.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerSourceTools(server: McpServer, ctx: McpContext, access: McpAccess) {
  const { ws, infra, assertSourceInWorkspace } = access;

  server.tool(
    'list_sources',
    'List GitHub/GitLab sources in the workspace.',
    {},
    safe(async () => {
      await ws();
      return json(await SourceService.list(ctx.workspaceId));
    }),
  );

  server.tool(
    'get_source',
    'Get a source by ID.',
    { sourceId: z.string().describe('The source ID') },
    safe(async ({ sourceId }) => {
      await assertSourceInWorkspace(sourceId);
      await ws();
      return json(await SourceService.get(sourceId));
    }),
  );

  server.tool(
    'create_source',
    'Create a GitHub or GitLab source (custom app). Requires OWNER or ADMIN. Prefer get_github_connect_url for platform GitHub.',
    {
      source: createSourceSchema.describe('Source create payload with provider github|gitlab'),
    },
    safe(async ({ source }) => {
      await infra();
      const body = createSourceSchema.parse(source);
      return json(await SourceService.create(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'update_source',
    'Update a custom GitHub/GitLab source. Requires OWNER or ADMIN. Platform GitHub connections are read-only.',
    {
      sourceId: z.string().describe('The source ID'),
      updates: z.record(z.string(), z.unknown()).describe('Fields to update'),
    },
    safe(async ({ sourceId, updates }) => {
      await infra();
      const { provider } = await assertSourceInWorkspace(sourceId);
      const body =
        provider === 'github'
          ? updateGithubSourceSchema.parse(updates)
          : updateGitlabSourceSchema.parse(updates);
      return json(await SourceService.update(sourceId, body));
    }),
  );

  server.tool(
    'delete_source',
    'Delete a source. Requires OWNER or ADMIN.',
    { sourceId: z.string().describe('The source ID') },
    safe(async ({ sourceId }) => {
      await infra();
      await assertSourceInWorkspace(sourceId);
      await SourceService.remove(sourceId);
      return json({ deleted: true, sourceId });
    }),
  );

  server.tool(
    'list_source_resources',
    'List services that use this source.',
    { sourceId: z.string().describe('The source ID') },
    safe(async ({ sourceId }) => {
      await assertSourceInWorkspace(sourceId);
      await ws();
      return json(await SourceService.listResources(sourceId));
    }),
  );

  server.tool(
    'list_github_repos',
    'List repositories available via a GitHub source installation. Requires OWNER or ADMIN.',
    { sourceId: z.string().describe('GitHub source ID') },
    safe(async ({ sourceId }) => {
      await infra();
      const { provider } = await assertSourceInWorkspace(sourceId);
      if (provider !== 'github') throw new NotFoundError('GitHub source not found.');
      const app = await prisma.githubApp.findUnique({
        where: { id: sourceId },
        include: { privateKey: true },
      });
      if (!app) throw new NotFoundError('GitHub source not found.');
      return json(await listGithubInstallationRepos(resolveGithubAuth(app)));
    }),
  );

  server.tool(
    'list_github_branches',
    'List branches for a repository on a GitHub source. Requires OWNER or ADMIN.',
    {
      sourceId: z.string().describe('GitHub source ID'),
      repo: z.string().min(1).describe('Repository full name, e.g. owner/repo'),
    },
    safe(async ({ sourceId, repo }) => {
      await infra();
      const { provider } = await assertSourceInWorkspace(sourceId);
      if (provider !== 'github') throw new NotFoundError('GitHub source not found.');
      if (!repo) throw new ValidationError('Missing repo parameter.');
      const app = await prisma.githubApp.findUnique({
        where: { id: sourceId },
        include: { privateKey: true },
      });
      if (!app) throw new NotFoundError('GitHub source not found.');
      return json(await listGithubBranches(resolveGithubAuth(app), repo));
    }),
  );

  server.tool(
    'get_github_connect_url',
    'Get a URL to connect the platform GitHub App to this workspace. Complete the install in a browser. Requires OWNER or ADMIN.',
    {},
    safe(async () => {
      await infra();
      return json(await SourceService.startPlatformConnect(ctx.workspaceId, ctx.user.id));
    }),
  );
}

export function buildSourceTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerSourceTools);
}
