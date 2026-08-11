import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { WorkspaceRole } from '@/lib/prisma';
import { slugify, randomSuffix } from '@/lib/utils/slug';
import { getUserByEmail } from '@/services/internal/auth/users';
import { enqueueEmail } from '@/lib/email/enqueue';
import { invitationEmailTemplate } from '@/lib/email/templates/invitation';
import { serverEnv } from '@/lib/env';
import { resolveProfilePictureUrl } from '@/lib/auth/profile-picture';
import { assertInvitedUser, type InviteeIdentity } from '@/lib/auth/invitation';
import { AppError, ConflictError, NotFoundError } from '@/lib/errors';
import { AuditService } from '@/services/internal/audit/audit';
import { setAuditActor } from '@/services/internal/audit/context';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITE_ROLES = new Set<WorkspaceRole>(['ADMIN', 'BILLING_ADMIN', 'MEMBER']);

export type FormerOwnerDisposition = 'ADMIN' | 'MEMBER' | 'LEAVE';

export type WorkspaceDeletePreflight = {
  workspace: { id: string; name: string; personal: boolean };
  projects: Array<{
    id: string;
    name: string;
    services: Array<{ id: string; name: string }>;
  }>;
  canDelete: boolean;
  blockers: { projectCount: number; serviceCount: number };
};

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${randomSuffix(4)}`;
  }
  return slug;
}

function assertAssignableRole(role: WorkspaceRole): void {
  if (role === 'OWNER' || !INVITE_ROLES.has(role)) {
    throw new AppError('Ownership can only be transferred, not assigned via invite or role change.');
  }
}

export const WorkspaceService = {
  listForUser(userId: string) {
    return prisma.workspace.findMany({
      where: { memberships: { some: { userId } } },
      include: { _count: { select: { projects: true, memberships: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async create(userId: string, input: { name: string; description?: string }) {
    setAuditActor({ userId, actorType: 'USER', actorRole: 'OWNER' });
    const slug = await uniqueSlug(input.name);
    const workspace = await prisma.workspace.create({
      data: {
        name: input.name,
        description: input.description,
        slug,
        ownerId: userId,
        memberships: { create: { userId, role: 'OWNER' } },
      },
    });
    await AuditService.record({
      workspaceId: workspace.id,
      action: 'workspace.created',
      resourceType: 'workspace',
      resourceId: workspace.id,
      resourceName: workspace.name,
      summary: `Created workspace "${workspace.name}"`,
    });
    return workspace;
  },

  async update(workspaceId: string, input: { name?: string; description?: string | null }) {
    const workspace = await prisma.workspace.update({ where: { id: workspaceId }, data: input });
    await AuditService.record({
      workspaceId,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: workspaceId,
      resourceName: workspace.name,
      summary: `Updated workspace "${workspace.name}"`,
      metadata: {
        fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
      },
    });
    return workspace;
  },

  async deletePreflight(workspaceId: string): Promise<WorkspaceDeletePreflight> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundError('Workspace not found.');

    const projects = await prisma.project.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        services: {
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const projectCount = projects.length;
    const serviceCount = projects.reduce((n, p) => n + p.services.length, 0);

    return {
      workspace: { id: ws.id, name: ws.name, personal: ws.personal },
      projects,
      canDelete: projectCount === 0 && serviceCount === 0 && !ws.personal,
      blockers: { projectCount, serviceCount },
    };
  },

  async remove(workspaceId: string) {
    const preflight = await this.deletePreflight(workspaceId);
    if (preflight.workspace.personal) {
      throw new AppError('Personal workspaces cannot be deleted.');
    }
    if (!preflight.canDelete) {
      throw new AppError(
        `Remove all projects and services before deleting this workspace (${preflight.blockers.projectCount} project(s), ${preflight.blockers.serviceCount} service(s) remaining).`,
      );
    }

    await AuditService.record({
      workspaceId,
      action: 'workspace.deleted',
      resourceType: 'workspace',
      resourceId: workspaceId,
      resourceName: preflight.workspace.name,
      summary: `Deleted workspace "${preflight.workspace.name}"`,
      metadata: {
        checklist: {
          projectsRemoved: 0,
          servicesRemoved: 0,
          note: 'DB cascade only; no remote SSH/Docker teardown',
        },
      },
    });

    await prisma.workspace.delete({ where: { id: workspaceId } });
  },

  async transferOwnership(
    workspaceId: string,
    actorUserId: string,
    input: { targetUserId: string; formerOwnerDisposition: FormerOwnerDisposition },
  ) {
    if (input.targetUserId === actorUserId) {
      throw new AppError('Cannot transfer ownership to yourself.');
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundError('Workspace not found.');
    if (ws.ownerId !== actorUserId) {
      throw new AppError('Only the current owner can transfer ownership.');
    }

    const target = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: input.targetUserId } },
    });
    if (!target) throw new AppError('Target user must already be a workspace member.');

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMembership.update({
        where: { workspaceId_userId: { workspaceId, userId: input.targetUserId } },
        data: { role: 'OWNER' },
      });
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { ownerId: input.targetUserId },
      });

      if (input.formerOwnerDisposition === 'LEAVE') {
        await tx.projectMembership.deleteMany({
          where: {
            userId: actorUserId,
            project: { workspaceId },
          },
        });
        await tx.workspaceMembership.delete({
          where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
        });
      } else {
        await tx.workspaceMembership.update({
          where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
          data: { role: input.formerOwnerDisposition },
        });
      }
    });

    await AuditService.record({
      workspaceId,
      action: 'workspace.ownership.transferred',
      resourceType: 'workspace',
      resourceId: workspaceId,
      resourceName: ws.name,
      summary: `Transferred ownership to user ${input.targetUserId}`,
      metadata: {
        previousOwnerId: actorUserId,
        newOwnerId: input.targetUserId,
        formerOwnerDisposition: input.formerOwnerDisposition,
      },
    });

    return { workspaceId, ownerId: input.targetUserId };
  },

  async leave(workspaceId: string, userId: string) {
    const membership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new NotFoundError('You are not a member of this workspace.');
    if (membership.role === 'OWNER') {
      throw new AppError('Owners must transfer ownership or delete the workspace before leaving.');
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundError('Workspace not found.');
    if (ws.personal) throw new AppError('Cannot leave a personal workspace.');

    await prisma.$transaction([
      prisma.projectMembership.deleteMany({
        where: { userId, project: { workspaceId } },
      }),
      prisma.workspaceMembership.delete({
        where: { workspaceId_userId: { workspaceId, userId } },
      }),
    ]);

    await AuditService.record({
      workspaceId,
      action: 'workspace.left',
      resourceType: 'workspace',
      resourceId: workspaceId,
      resourceName: ws.name,
      summary: `Left workspace "${ws.name}"`,
      metadata: { previousRole: membership.role },
    });
  },

  async listMembers(workspaceId: string) {
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true, profilePicture: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        user: {
          ...row.user,
          profilePicture: await resolveProfilePictureUrl(row.user.profilePicture),
        },
      })),
    );
  },

  listInvitations(workspaceId: string) {
    return prisma.workspaceInvitation.findMany({
      where: { workspaceId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  },

  async invite(
    workspaceId: string,
    invitedById: string,
    input: { email: string; role: WorkspaceRole },
  ) {
    assertAssignableRole(input.role);
    const email = input.email.toLowerCase();
    const existing = await getUserByEmail(email);
    if (existing) {
      const already = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existing.id } },
      });
      if (already) throw new ConflictError('This person is already a member.');
    }

    const token = crypto.randomBytes(24).toString('hex');
    const invitation = await prisma.workspaceInvitation.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      update: {
        role: input.role,
        token,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedById,
      },
      create: {
        email,
        role: input.role,
        token,
        workspaceId,
        invitedById,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const url = `${serverEnv().APP_URL}/invitations/${token}`;
    const template = invitationEmailTemplate({ kind: 'workspace', url });
    await enqueueEmail({ to: email, ...template });

    await AuditService.record({
      workspaceId,
      action: 'workspace.member.invited',
      resourceType: 'workspace',
      resourceId: workspaceId,
      summary: `Invited ${email} as ${input.role}`,
      metadata: { email, role: input.role, invitationId: invitation.id },
    });

    return invitation;
  },

  async revokeInvitation(
    workspaceId: string,
    invitationId: string,
    actor?: { actorUserId?: string; actorRole?: WorkspaceRole },
  ) {
    const invitation = await prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' },
    });
    await AuditService.record({
      workspaceId,
      actorUserId: actor?.actorUserId,
      actorRole: actor?.actorRole,
      action: 'workspace.invitation.revoked',
      resourceType: 'workspace',
      resourceId: workspaceId,
      summary: `Revoked invitation for ${invitation.email}`,
      metadata: { invitationId, email: invitation.email },
    });
  },

  async acceptInvitation(token: string, user: InviteeIdentity) {
    const userId = user.id;
    const invite = await prisma.workspaceInvitation.findUnique({ where: { token } });
    if (!invite || invite.status !== 'PENDING') throw new NotFoundError('Invitation not found.');
    if (invite.expiresAt < new Date()) {
      await prisma.workspaceInvitation.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invitation has expired.');
    }
    assertInvitedUser(invite.email, user);
    // Never elevate to OWNER via invitation acceptance.
    const role = invite.role === 'OWNER' ? 'MEMBER' : invite.role;
    await prisma.$transaction([
      prisma.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        update: { role },
        create: { workspaceId: invite.workspaceId, userId, role },
      }),
      prisma.workspaceInvitation.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } }),
    ]);
    setAuditActor({ userId, actorType: 'USER', actorRole: role });
    await AuditService.record({
      workspaceId: invite.workspaceId,
      action: 'workspace.member.invited',
      resourceType: 'workspace',
      resourceId: invite.workspaceId,
      summary: `Accepted workspace invitation as ${role}`,
      metadata: { invitationId: invite.id, role },
    });
    return invite.workspaceId;
  },

  async changeRole(workspaceId: string, targetUserId: string, role: WorkspaceRole) {
    assertAssignableRole(role);
    const membership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!membership) throw new NotFoundError('Member not found.');
    if (membership.role === 'OWNER') {
      throw new AppError('Cannot change the owner role. Transfer ownership instead.');
    }

    const updated = await prisma.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role },
    });

    await AuditService.record({
      workspaceId,
      action: 'workspace.member.role_changed',
      resourceType: 'workspace',
      resourceId: workspaceId,
      summary: `Changed member role to ${role}`,
      metadata: {
        targetUserId,
        previousRole: membership.role,
        newRole: role,
      },
    });

    return updated;
  },

  async removeMember(workspaceId: string, targetUserId: string) {
    const membership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!membership) throw new NotFoundError('Member not found.');
    if (membership.role === 'OWNER') {
      throw new AppError('Cannot remove the workspace owner. Transfer ownership first.');
    }

    await prisma.$transaction([
      prisma.projectMembership.deleteMany({
        where: { userId: targetUserId, project: { workspaceId } },
      }),
      prisma.workspaceMembership.delete({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      }),
    ]);

    await AuditService.record({
      workspaceId,
      action: 'workspace.member.removed',
      resourceType: 'workspace',
      resourceId: workspaceId,
      summary: `Removed member ${targetUserId}`,
      metadata: { targetUserId, previousRole: membership.role },
    });
  },
};
