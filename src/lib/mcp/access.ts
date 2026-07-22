import {
  workspaceContextFor,
  projectAccessFor,
  canManageInfrastructure,
  roleAtLeast,
  type WorkspaceContext,
  type ProjectAccess,
} from '@/lib/auth/access';
import { ForbiddenError } from '@/lib/errors';
import { BillingService } from '@/services/internal/billing/billing';
import { ServiceModule } from '@/services/internal/service/service';
import { ServerService } from '@/services/internal/server/server';
import { SourceService } from '@/services/internal/sources/sources';
import { StorageService } from '@/services/internal/storages/storages';
import { PrivateKeyService } from '@/services/internal/privatekey/privatekey';
import { SharedVariableService } from '@/services/internal/shared-variables/shared-variables';
import { TagService } from '@/services/internal/tags/tags';
import type { McpContext } from '@/lib/mcp/helpers';

/**
 * Access helpers scoped to the MCP token's workspace. Same RBAC as the REST API.
 */
export function createMcpAccess(ctx: McpContext) {
  const ws = () => workspaceContextFor(ctx.user, ctx.workspaceId, { actorType: 'TOKEN' });

  const projectAccess = async (projectId: string, manage = false): Promise<ProjectAccess> => {
    const access = await projectAccessFor(ctx.user, projectId);
    if (access.workspaceId !== ctx.workspaceId) {
      throw new ForbiddenError('Project belongs to a different workspace than this token.');
    }
    if (manage && !access.canManage) {
      throw new ForbiddenError('This action requires manage access to the project.');
    }
    if (manage) {
      await BillingService.assertProjectWritable(access.workspaceId);
    }
    return access;
  };

  const serviceAccess = async (serviceId: string, manage = false) => {
    const projectId = await ServiceModule.projectIdFor(serviceId);
    return projectAccess(projectId, manage);
  };

  const infra = async (): Promise<WorkspaceContext> => {
    const context = await ws();
    if (!canManageInfrastructure(context.role)) {
      throw new ForbiddenError('Only workspace owners and admins can manage infrastructure.');
    }
    return context;
  };

  const admin = async (): Promise<WorkspaceContext> => {
    const context = await ws();
    if (!roleAtLeast(context.role, 'ADMIN')) {
      throw new ForbiddenError('Requires ADMIN role or higher.');
    }
    return context;
  };

  const assertServerInWorkspace = async (serverId: string) => {
    const workspaceId = await ServerService.workspaceIdFor(serverId);
    if (workspaceId !== ctx.workspaceId) {
      throw new ForbiddenError('Server belongs to a different workspace than this token.');
    }
    return workspaceId;
  };

  const assertSourceInWorkspace = async (sourceId: string) => {
    const { workspaceId, provider } = await SourceService.resolve(sourceId);
    if (workspaceId !== ctx.workspaceId) {
      throw new ForbiddenError('Source belongs to a different workspace than this token.');
    }
    return { workspaceId, provider };
  };

  const assertStorageInWorkspace = async (storageId: string) => {
    const workspaceId = await StorageService.workspaceIdFor(storageId);
    if (workspaceId !== ctx.workspaceId) {
      throw new ForbiddenError('Storage belongs to a different workspace than this token.');
    }
    return workspaceId;
  };

  const assertKeyInWorkspace = async (keyId: string) => {
    const workspaceId = await PrivateKeyService.workspaceIdFor(keyId);
    if (workspaceId !== ctx.workspaceId) {
      throw new ForbiddenError('Private key belongs to a different workspace than this token.');
    }
    return workspaceId;
  };

  const assertSharedVariableInWorkspace = async (variableId: string) => {
    const workspaceId = await SharedVariableService.workspaceIdFor(variableId);
    if (workspaceId !== ctx.workspaceId) {
      throw new ForbiddenError('Shared variable belongs to a different workspace than this token.');
    }
    return workspaceId;
  };

  const assertTagInWorkspace = async (tagId: string) => {
    const workspaceId = await TagService.workspaceIdFor(tagId);
    if (workspaceId !== ctx.workspaceId) {
      throw new ForbiddenError('Tag belongs to a different workspace than this token.');
    }
    return workspaceId;
  };

  return {
    ws,
    projectAccess,
    serviceAccess,
    infra,
    admin,
    assertServerInWorkspace,
    assertSourceInWorkspace,
    assertStorageInWorkspace,
    assertKeyInWorkspace,
    assertSharedVariableInWorkspace,
    assertTagInWorkspace,
  };
}

export type McpAccess = ReturnType<typeof createMcpAccess>;
