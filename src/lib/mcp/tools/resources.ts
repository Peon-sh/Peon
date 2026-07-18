import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { ProjectService } from '@/services/internal/project/project';
import { ServerService } from '@/services/internal/server/server';
import { canManageInfrastructure } from '@/lib/auth/access';
import type { McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerMcpResources(server: McpServer, ctx: McpContext, access: McpAccess) {
  const { ws } = access;

  server.resource(
    'projects',
    'peon://projects',
    { description: 'Projects in the workspace the API token is scoped to.' },
    async () => {
      const context = await ws();
      const projects = await ProjectService.listAccessible(
        ctx.workspaceId,
        ctx.user.id,
        context.role,
      );
      return {
        contents: [
          {
            uri: 'peon://projects',
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    'workspace',
    'peon://workspace',
    { description: 'Workspace this API token is scoped to.' },
    async () => {
      const context = await ws();
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: ctx.workspaceId },
        select: {
          id: true,
          name: true,
          description: true,
          slug: true,
          personal: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return {
        contents: [
          {
            uri: 'peon://workspace',
            mimeType: 'application/json',
            text: JSON.stringify({ ...workspace, role: context.role }, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    'servers',
    'peon://servers',
    { description: 'Servers in the workspace (OWNER/ADMIN only).' },
    async () => {
      const context = await ws();
      if (!canManageInfrastructure(context.role)) {
        return {
          contents: [
            {
              uri: 'peon://servers',
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'Requires OWNER or ADMIN role.' }, null, 2),
            },
          ],
        };
      }
      const servers = await ServerService.list(ctx.workspaceId);
      return {
        contents: [
          {
            uri: 'peon://servers',
            mimeType: 'application/json',
            text: JSON.stringify(servers, null, 2),
          },
        ],
      };
    },
  );
}
