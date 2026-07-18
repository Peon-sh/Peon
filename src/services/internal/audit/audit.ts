import { prisma } from '@/lib/prisma';
import type { AuditActorType, Prisma, WorkspaceRole } from '@/lib/prisma';
import { getAuditActor } from '@/services/internal/audit/context';

export type AuditRecordInput = {
  workspaceId: string | null;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  actorRole?: WorkspaceRole | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceName?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Persist a workspace audit event. Never throws to callers — audit failures
 * must not break the underlying mutation. Actor fields fall back to ALS context
 * set by access helpers / MCP / webhooks.
 */
export async function recordAudit(input: AuditRecordInput): Promise<void> {
  try {
    const ctx = getAuditActor();
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId ?? ctx?.userId ?? null,
        actorType: input.actorType ?? ctx?.actorType ?? 'USER',
        actorRole: input.actorRole ?? ctx?.actorRole ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        resourceName: input.resourceName ?? null,
        summary: input.summary,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error('[audit] failed to record', input.action, err);
  }
}

export type AuditListFilters = {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
  action?: string | null;
  actorUserId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  q?: string | null;
  from?: Date | null;
  to?: Date | null;
};

export async function listWorkspaceAudit(filters: AuditListFilters) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const where: Prisma.WorkspaceAuditLogWhereInput = {
    workspaceId: filters.workspaceId,
  };
  if (filters.action) where.action = filters.action;
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.resourceId) where.resourceId = filters.resourceId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { summary: { contains: q, mode: 'insensitive' } },
      { resourceName: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.workspaceAuditLog.findMany({
    where,
    take: limit + 1,
    ...(filters.cursor
      ? { cursor: { id: filters.cursor }, skip: 1 }
      : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      actor: { select: { id: true, email: true, name: true } },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return { items, nextCursor };
}

export const AuditService = {
  record: recordAudit,
  list: listWorkspaceAudit,
};
