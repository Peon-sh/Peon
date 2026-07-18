import { prisma } from '@/lib/prisma';
import { AuditService, type AuditRecordInput } from '@/services/internal/audit/audit';

/** Resolve workspace + service name for audit rows. */
export async function serviceAuditContext(serviceId: string) {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      name: true,
      project: { select: { workspaceId: true } },
    },
  });
  if (!svc) return null;
  return {
    workspaceId: svc.project.workspaceId,
    resourceId: svc.id,
    resourceName: svc.name,
  };
}

export async function recordServiceAudit(
  serviceId: string,
  input: Omit<AuditRecordInput, 'workspaceId' | 'resourceType' | 'resourceId' | 'resourceName'> & {
    resourceType?: string;
    resourceId?: string | null;
    resourceName?: string | null;
  },
): Promise<void> {
  const ctx = await serviceAuditContext(serviceId);
  if (!ctx) return;
  await AuditService.record({
    workspaceId: ctx.workspaceId,
    resourceType: input.resourceType ?? 'service',
    resourceId: input.resourceId ?? ctx.resourceId,
    resourceName: input.resourceName ?? ctx.resourceName,
    action: input.action,
    summary: input.summary,
    metadata: input.metadata,
    actorUserId: input.actorUserId,
    actorType: input.actorType,
    actorRole: input.actorRole,
  });
}
