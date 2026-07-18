import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { accessibleProjectIds, roleAtLeast } from '@/lib/auth/access';
import { ForbiddenError } from '@/lib/errors';
import { ProjectService } from '@/services/internal/project/project';
import { WorkspaceService } from '@/services/internal/workspace/workspace';
import { ServiceModule } from '@/services/internal/service/service';
import {
  updateWorkspaceSchema,
  inviteWorkspaceMemberSchema,
  updateMemberRoleSchema,
  updateProjectSchema,
  addProjectMemberSchema,
  updateProjectMemberRoleSchema,
} from '@/schemas/workspace.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerWorkspaceProjectTools(
  server: McpServer,
  ctx: McpContext,
  access: McpAccess,
) {
  const { ws, projectAccess, admin } = access;

  server.tool(
    'get_context',
    'Get the authenticated user, the workspace this API token is scoped to, and the user role in it.',
    {},
    safe(async () => {
      const context = await ws();
      return json({
        user: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name },
        workspaceId: ctx.workspaceId,
        role: context.role,
      });
    }),
  );

  server.tool(
    'get_workspace',
    'Get the workspace this API token is scoped to, including your role.',
    {},
    safe(async () => {
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
          _count: { select: { projects: true, memberships: true } },
        },
      });
      return json({ ...workspace, role: context.role });
    }),
  );

  server.tool(
    'update_workspace',
    'Update workspace name or description (requires ADMIN role or higher).',
    {
      name: z.string().min(1).max(80).optional().describe('Workspace name'),
      description: z.string().max(500).nullable().optional().describe('Workspace description'),
    },
    safe(async (args) => {
      await admin();
      const body = updateWorkspaceSchema.parse(args);
      return json(await WorkspaceService.update(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'list_workspace_members',
    'List members of the workspace.',
    {},
    safe(async () => {
      await ws();
      return json(await WorkspaceService.listMembers(ctx.workspaceId));
    }),
  );

  server.tool(
    'invite_workspace_member',
    'Invite a user to the workspace by email (requires ADMIN role or higher).',
    {
      email: z
        .string()
        .min(3)
        .max(320)
        // OpenAI tool schemas reject regex lookaround (Zod .email() uses it).
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
        .describe('Email address to invite'),
      role: z
        .enum(['BILLING_ADMIN', 'ADMIN', 'MEMBER'])
        .optional()
        .describe('Role to assign (default MEMBER). OWNER can only be transferred.'),
    },
    safe(async (args) => {
      const context = await admin();
      const body = inviteWorkspaceMemberSchema.parse(args);
      return json(await WorkspaceService.invite(ctx.workspaceId, context.user.id, body));
    }),
  );

  server.tool(
    'change_workspace_member_role',
    'Change a workspace member role (requires ADMIN role or higher). Cannot set OWNER — use transfer_workspace_ownership.',
    {
      userId: z.string().describe('Target user ID'),
      role: z.enum(['BILLING_ADMIN', 'ADMIN', 'MEMBER']).describe('New role'),
    },
    safe(async ({ userId, role }) => {
      await admin();
      const body = updateMemberRoleSchema.parse({ role });
      return json(await WorkspaceService.changeRole(ctx.workspaceId, userId, body.role));
    }),
  );

  server.tool(
    'transfer_workspace_ownership',
    'Transfer workspace ownership to an existing member (OWNER only).',
    {
      targetUserId: z.string().describe('Member who becomes the new OWNER'),
      formerOwnerDisposition: z
        .enum(['ADMIN', 'MEMBER', 'LEAVE'])
        .describe('What happens to the former owner'),
    },
    safe(async (args) => {
      const context = await ws();
      if (context.role !== 'OWNER') {
        throw new ForbiddenError('Requires OWNER role.');
      }
      return json(
        await WorkspaceService.transferOwnership(ctx.workspaceId, context.user.id, {
          targetUserId: args.targetUserId,
          formerOwnerDisposition: args.formerOwnerDisposition,
        }),
      );
    }),
  );

  server.tool(
    'leave_workspace',
    'Leave the workspace (non-OWNER members only). Owners must transfer or delete first.',
    {},
    safe(async () => {
      const context = await ws();
      await WorkspaceService.leave(ctx.workspaceId, context.user.id);
      return json({ left: true });
    }),
  );

  server.tool(
    'remove_workspace_member',
    'Remove a member from the workspace (requires ADMIN role or higher).',
    { userId: z.string().describe('Target user ID') },
    safe(async ({ userId }) => {
      await admin();
      await WorkspaceService.removeMember(ctx.workspaceId, userId);
      return json({ removed: true, userId });
    }),
  );

  server.tool(
    'list_workspace_invitations',
    'List pending workspace invitations.',
    {},
    safe(async () => {
      await ws();
      return json(await WorkspaceService.listInvitations(ctx.workspaceId));
    }),
  );

  server.tool(
    'revoke_workspace_invitation',
    'Revoke a pending workspace invitation (requires ADMIN role or higher).',
    { invitationId: z.string().describe('Invitation ID') },
    safe(async ({ invitationId }) => {
      await admin();
      await WorkspaceService.revokeInvitation(ctx.workspaceId, invitationId);
      return json({ revoked: true, invitationId });
    }),
  );

  server.tool(
    'list_projects',
    'List projects in the workspace that the user can access.',
    {},
    safe(async () => {
      const context = await ws();
      return json(await ProjectService.listAccessible(ctx.workspaceId, ctx.user.id, context.role));
    }),
  );

  server.tool(
    'create_project',
    'Create a new project in the workspace (requires OWNER or ADMIN role).',
    {
      name: z.string().min(1).describe('Project name'),
      description: z.string().optional().describe('Optional project description'),
    },
    safe(async ({ name, description }) => {
      const context = await ws();
      if (!roleAtLeast(context.role, 'ADMIN')) {
        throw new ForbiddenError('Requires ADMIN role or higher.');
      }
      return json(await ProjectService.create(ctx.workspaceId, ctx.user.id, { name, description }));
    }),
  );

  server.tool(
    'get_project',
    'Get project details by ID.',
    { projectId: z.string().describe('The project ID') },
    safe(async ({ projectId }) => {
      await projectAccess(projectId);
      return json(await ProjectService.get(projectId));
    }),
  );

  server.tool(
    'update_project',
    'Update a project. Requires manage access.',
    {
      projectId: z.string().describe('The project ID'),
      name: z.string().min(1).max(80).optional().describe('Project name'),
      description: z.string().max(500).nullable().optional().describe('Project description'),
      wildcardDomain: z.string().max(255).nullable().optional().describe('Wildcard domain'),
    },
    safe(async ({ projectId, ...rest }) => {
      await projectAccess(projectId, true);
      const body = updateProjectSchema.parse(rest);
      return json(await ProjectService.update(projectId, body));
    }),
  );

  server.tool(
    'delete_project',
    'Delete a project. Requires manage access.',
    { projectId: z.string().describe('The project ID') },
    safe(async ({ projectId }) => {
      await projectAccess(projectId, true);
      await ProjectService.remove(projectId);
      return json({ deleted: true, projectId });
    }),
  );

  server.tool(
    'list_project_members',
    'List members of a project.',
    { projectId: z.string().describe('The project ID') },
    safe(async ({ projectId }) => {
      await projectAccess(projectId);
      return json(await ProjectService.listMembers(projectId));
    }),
  );

  server.tool(
    'add_project_member',
    'Add an existing workspace member to a project. Requires manage access.',
    {
      projectId: z.string().describe('The project ID'),
      userId: z.string().describe('Workspace member user ID'),
      role: z.enum(['ADMIN', 'MEMBER']).optional().describe('Project role (default MEMBER)'),
    },
    safe(async ({ projectId, userId, role }) => {
      await projectAccess(projectId, true);
      const body = addProjectMemberSchema.parse({ userId, role });
      return json(
        await ProjectService.addMember(projectId, ctx.workspaceId, body.userId, body.role),
      );
    }),
  );

  server.tool(
    'change_project_member_role',
    'Change a project member role. Requires manage access.',
    {
      projectId: z.string().describe('The project ID'),
      userId: z.string().describe('User ID'),
      role: z.enum(['ADMIN', 'MEMBER']).describe('New project role'),
    },
    safe(async ({ projectId, userId, role }) => {
      await projectAccess(projectId, true);
      const body = updateProjectMemberRoleSchema.parse({ role });
      return json(await ProjectService.changeRole(projectId, userId, body.role));
    }),
  );

  server.tool(
    'remove_project_member',
    'Remove a member from a project. Requires manage access.',
    {
      projectId: z.string().describe('The project ID'),
      userId: z.string().describe('User ID'),
    },
    safe(async ({ projectId, userId }) => {
      await projectAccess(projectId, true);
      await ProjectService.removeMember(projectId, userId);
      return json({ removed: true, projectId, userId });
    }),
  );

  server.tool(
    'list_active_deployments',
    'List QUEUED and IN_PROGRESS deployments across projects you can access.',
    {},
    safe(async () => {
      const context = await ws();
      const projectIds = await accessibleProjectIds(ctx.workspaceId, ctx.user.id, context.role);
      return json(await ServiceModule.listActiveDeployments(ctx.workspaceId, projectIds));
    }),
  );
}

export function buildWorkspaceProjectTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerWorkspaceProjectTools);
}
