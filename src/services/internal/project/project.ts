import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { ProjectRole } from '@/lib/prisma';
import { accessibleProjectIds } from '@/lib/auth/access';
import { getUserByEmail } from '@/services/internal/auth/users';
import { enqueueEmail } from '@/lib/email/enqueue';
import { invitationEmailTemplate } from '@/lib/email/templates/invitation';
import { serverEnv } from '@/lib/env';
import { resolveProfilePictureUrl } from '@/lib/auth/profile-picture';
import { assertInvitedUser, type InviteeIdentity } from '@/lib/auth/invitation';
import { AppError, ConflictError, NotFoundError } from '@/lib/errors';
import { AuditService } from '@/services/internal/audit/audit';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ProjectService = {
  async listAccessible(workspaceId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'BILLING_ADMIN' | 'MEMBER') {
    const ids = await accessibleProjectIds(workspaceId, userId, role);
    return prisma.project.findMany({
      where: ids === 'ALL' ? { workspaceId } : { workspaceId, id: { in: ids } },
      include: { _count: { select: { services: true, memberships: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(workspaceId: string, creatorId: string, input: { name: string; description?: string }) {
    const { BillingService } = await import('@/services/internal/billing/billing');
    await BillingService.assertCanCreateProject(workspaceId);

    const project = await prisma.project.create({
      data: {
        name: input.name,
        description: input.description,
        workspaceId,
        settings: { create: {} },
        memberships: { create: { userId: creatorId, role: 'ADMIN' } },
      },
    });
    await AuditService.record({
      workspaceId,
      action: 'project.created',
      resourceType: 'project',
      resourceId: project.id,
      resourceName: project.name,
      summary: `Created project "${project.name}"`,
    });
    return project;
  },

  get(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      include: {
        settings: true,
        _count: { select: { services: { where: { deletedAt: null } } } },
        services: {
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
    });
  },

  async update(
    projectId: string,
    input: { name?: string; description?: string | null; wildcardDomain?: string | null },
  ) {
    const { wildcardDomain, ...projectInput } = input;
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...projectInput,
        ...(wildcardDomain !== undefined
          ? {
              settings: {
                upsert: {
                  create: { wildcardDomain },
                  update: { wildcardDomain },
                },
              },
            }
          : {}),
      },
      include: {
        settings: true,
        _count: { select: { services: { where: { deletedAt: null } } } },
      },
    });
    await AuditService.record({
      workspaceId: project.workspaceId,
      action: 'project.updated',
      resourceType: 'project',
      resourceId: project.id,
      resourceName: project.name,
      summary: `Updated project "${project.name}"`,
      metadata: {
        fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
      },
    });
    return project;
  },

  async remove(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        services: {
          where: { deletedAt: null },
          select: { id: true, name: true },
        },
      },
    });
    if (!project) throw new NotFoundError('Project not found.');
    if (project.services.length > 0) {
      throw new AppError(
        `Remove all services before deleting this project (${project.services.length} remaining: ${project.services.map((s) => s.name).join(', ')}).`,
      );
    }

    await AuditService.record({
      workspaceId: project.workspaceId,
      action: 'project.deleted',
      resourceType: 'project',
      resourceId: project.id,
      resourceName: project.name,
      summary: `Deleted project "${project.name}"`,
    });

    await prisma.project.delete({ where: { id: projectId } });
  },

  async listMembers(projectId: string) {
    const rows = await prisma.projectMembership.findMany({
      where: { projectId },
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

  async addMember(projectId: string, workspaceId: string, userId: string, role: ProjectRole) {
    const membership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new AppError('User must be a workspace member first.');
    const result = await prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { role },
      create: { projectId, userId, role },
    });
    await AuditService.record({
      workspaceId,
      action: 'project.member.added',
      resourceType: 'project',
      resourceId: projectId,
      summary: `Added project member as ${role}`,
      metadata: { userId, role },
    });
    return result;
  },

  async removeMember(projectId: string, userId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundError('Project not found.');
    await prisma.projectMembership.deleteMany({ where: { projectId, userId } });
    await AuditService.record({
      workspaceId: project.workspaceId,
      action: 'project.member.removed',
      resourceType: 'project',
      resourceId: projectId,
      resourceName: project.name,
      summary: `Removed project member`,
      metadata: { userId },
    });
  },

  async changeRole(projectId: string, userId: string, role: ProjectRole) {
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) throw new NotFoundError('Member not found.');

    if (membership.role === 'ADMIN' && role !== 'ADMIN') {
      const admins = await prisma.projectMembership.count({
        where: { projectId, role: 'ADMIN' },
      });
      if (admins <= 1) {
        throw new AppError('A project must have at least one admin.');
      }
    }

    const updated = await prisma.projectMembership.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
      include: {
        user: { select: { id: true, email: true, name: true, profilePicture: true } },
        project: { select: { workspaceId: true, name: true } },
      },
    });

    await AuditService.record({
      workspaceId: updated.project.workspaceId,
      action: 'project.member.role_changed',
      resourceType: 'project',
      resourceId: projectId,
      resourceName: updated.project.name,
      summary: `Changed project member role to ${role}`,
      metadata: { userId, previousRole: membership.role, newRole: role },
    });

    return {
      ...updated,
      user: {
        ...updated.user,
        profilePicture: await resolveProfilePictureUrl(updated.user.profilePicture),
      },
    };
  },

  async invite(
    projectId: string,
    workspaceId: string,
    invitedById: string,
    input: { email: string; role: ProjectRole },
  ) {
    const email = input.email.toLowerCase();
    const user = await getUserByEmail(email);

    if (user) {
      const wsMember = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
      });
      if (wsMember) {
        const existing = await prisma.projectMembership.findUnique({
          where: { projectId_userId: { projectId, userId: user.id } },
        });
        if (existing) throw new ConflictError('Already a project member.');
        return {
          added: true,
          membership: await this.addMember(projectId, workspaceId, user.id, input.role),
        };
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    const invitation = await prisma.projectInvitation.upsert({
      where: { projectId_email: { projectId, email } },
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
        projectId,
        workspaceId,
        invitedById,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    const url = `${serverEnv().APP_URL}/invitations/${token}`;
    const template = invitationEmailTemplate({ kind: 'project', url });
    await enqueueEmail({ to: email, ...template });
    await AuditService.record({
      workspaceId,
      action: 'project.invitation.created',
      resourceType: 'project',
      resourceId: projectId,
      summary: `Invited ${email} to project as ${input.role}`,
      metadata: { email, role: input.role, invitationId: invitation.id },
    });
    return { added: false, invitation };
  },

  async acceptInvitation(token: string, user: InviteeIdentity) {
    const userId = user.id;
    const invite = await prisma.projectInvitation.findUnique({ where: { token } });
    if (!invite || invite.status !== 'PENDING') throw new NotFoundError('Invitation not found.');
    if (invite.expiresAt < new Date()) {
      await prisma.projectInvitation.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invitation has expired.');
    }
    assertInvitedUser(invite.email, user);
    await prisma.$transaction([
      prisma.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        update: {},
        create: { workspaceId: invite.workspaceId, userId, role: 'MEMBER' },
      }),
      prisma.projectMembership.upsert({
        where: { projectId_userId: { projectId: invite.projectId, userId } },
        update: { role: invite.role },
        create: { projectId: invite.projectId, userId, role: invite.role },
      }),
      prisma.projectInvitation.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } }),
    ]);
    await AuditService.record({
      workspaceId: invite.workspaceId,
      actorUserId: userId,
      action: 'project.invitation.accepted',
      resourceType: 'project',
      resourceId: invite.projectId,
      summary: `Accepted project invitation as ${invite.role}`,
      metadata: { invitationId: invite.id, role: invite.role },
    });
    return invite.projectId;
  },
};
