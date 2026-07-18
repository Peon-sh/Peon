import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const inviteWorkspaceMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['BILLING_ADMIN', 'ADMIN', 'MEMBER']).default('MEMBER'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['BILLING_ADMIN', 'ADMIN', 'MEMBER']),
});

export const transferOwnershipSchema = z.object({
  targetUserId: z.string().min(1),
  formerOwnerDisposition: z.enum(['ADMIN', 'MEMBER', 'LEAVE']),
});

export const listAuditSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  action: z.string().optional(),
  actorUserId: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  wildcardDomain: z.string().max(255).nullable().optional(),
});

export const addProjectMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export const updateProjectMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export const inviteProjectMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});
