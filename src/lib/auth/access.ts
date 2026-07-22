import { prisma } from '@/lib/prisma';
import type { WorkspaceRole, ProjectRole, User } from '@/lib/prisma';
import { requireUser } from '@/lib/auth/context';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { setAuditActor } from '@/services/internal/audit/context';

const ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  BILLING_ADMIN: 2,
  MEMBER: 1,
};

export function roleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Roles allowed to manage infrastructure (servers, sources, keys, settings). */
export function canManageInfrastructure(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export interface WorkspaceContext {
  user: User;
  workspaceId: string;
  role: WorkspaceRole;
}

/** Workspace membership check for an explicit user (session or API token). */
export async function workspaceContextFor(
  user: User,
  workspaceId: string,
  opts?: { actorType?: 'USER' | 'TOKEN' },
): Promise<WorkspaceContext> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) throw new ForbiddenError('You are not a member of this workspace.');
  const ctx = { user, workspaceId, role: membership.role };
  setAuditActor({
    userId: user.id,
    actorType: opts?.actorType ?? 'USER',
    actorRole: membership.role,
  });
  return ctx;
}

/** Require that the current user is a member of the workspace. */
export async function requireWorkspaceMember(workspaceId: string): Promise<WorkspaceContext> {
  const user = await requireUser();
  return workspaceContextFor(user, workspaceId);
}

/** Require a minimum workspace role. */
export async function requireWorkspaceRole(
  workspaceId: string,
  min: WorkspaceRole,
): Promise<WorkspaceContext> {
  const ctx = await requireWorkspaceMember(workspaceId);
  if (!roleAtLeast(ctx.role, min)) {
    throw new ForbiddenError(`Requires ${min} role or higher.`);
  }
  return ctx;
}

/** Require OWNER or BILLING_ADMIN (not plain ADMIN) for billing mutations. */
export async function requireBillingManage(workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await requireWorkspaceMember(workspaceId);
  if (ctx.role !== 'OWNER' && ctx.role !== 'BILLING_ADMIN') {
    throw new ForbiddenError('Only workspace owners and billing admins can manage billing.');
  }
  return ctx;
}

/** Require infrastructure-management rights (OWNER/ADMIN). */
export async function requireInfraAccess(workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await requireWorkspaceMember(workspaceId);
  if (!canManageInfrastructure(ctx.role)) {
    throw new ForbiddenError('Only workspace owners and admins can manage infrastructure.');
  }
  return ctx;
}

export interface ProjectAccess extends WorkspaceContext {
  projectId: string;
  /** True when the user can modify the project (workspace admin/owner or project admin). */
  canManage: boolean;
}

/**
 * Project access check for an explicit user (session or API token). Workspace
 * OWNER/ADMIN can access all projects; other roles need a ProjectMembership.
 */
export async function projectAccessFor(user: User, projectId: string): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found.');

  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: user.id } },
  });
  if (!membership) throw new ForbiddenError('You are not a member of this workspace.');

  const base = {
    user,
    workspaceId: project.workspaceId,
    role: membership.role,
    projectId,
  };
  setAuditActor({
    userId: user.id,
    actorType: 'USER',
    actorRole: membership.role,
  });

  if (canManageInfrastructure(membership.role)) {
    return { ...base, canManage: true };
  }

  const projectMembership = await prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!projectMembership) throw new ForbiddenError('You do not have access to this project.');

  return {
    ...base,
    canManage: projectMembership.role === 'ADMIN',
  };
}

/** Require access to a project for the current session user. */
export async function requireProjectAccess(projectId: string): Promise<ProjectAccess> {
  const user = await requireUser();
  return projectAccessFor(user, projectId);
}

/** Require the ability to modify a project (throws if read-only or billing inactive). */
export async function requireProjectManage(projectId: string): Promise<ProjectAccess> {
  const access = await requireProjectAccess(projectId);
  if (!access.canManage) throw new ForbiddenError('You cannot modify this project.');
  const { BillingService } = await import('@/services/internal/billing/billing');
  await BillingService.assertProjectWritable(access.workspaceId);
  return access;
}

/**
 * Allow project/service deletion even when subscription is inactive
 * (read/delete-only mode after cancel).
 */
export async function requireProjectDelete(projectId: string): Promise<ProjectAccess> {
  const access = await requireProjectAccess(projectId);
  if (!access.canManage) throw new ForbiddenError('You cannot modify this project.');
  return access;
}

/** IDs of projects the user can see in a workspace. */
export async function accessibleProjectIds(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<string[] | 'ALL'> {
  if (canManageInfrastructure(role)) return 'ALL';
  const memberships = await prisma.projectMembership.findMany({
    where: { userId, project: { workspaceId } },
    select: { projectId: true },
  });
  return memberships.map((m) => m.projectId);
}

export type { ProjectRole };
