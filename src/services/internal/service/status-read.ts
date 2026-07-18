import { prisma } from '@/lib/prisma';
import type { DeploymentStatus, ServiceStatus } from '@/lib/prisma';
import { reconcileServiceStatus } from '@/services/internal/deploy/status';

export type DeployHint = {
  latestNonPreviewStatus: DeploymentStatus | null;
  hasFinishedProduction: boolean;
  hasActiveDeploy: boolean;
};

export async function deploymentHintsForServices(
  serviceIds: string[],
): Promise<Map<string, DeployHint>> {
  const map = new Map<string, DeployHint>();
  for (const id of serviceIds) {
    map.set(id, {
      latestNonPreviewStatus: null,
      hasFinishedProduction: false,
      hasActiveDeploy: false,
    });
  }
  if (!serviceIds.length) return map;

  const rows = await prisma.deployment.findMany({
    where: { serviceId: { in: serviceIds }, isPreview: false },
    orderBy: { createdAt: 'desc' },
    select: { serviceId: true, status: true },
  });

  for (const row of rows) {
    const hint = map.get(row.serviceId);
    if (!hint) continue;
    if (!hint.latestNonPreviewStatus) hint.latestNonPreviewStatus = row.status;
    if (row.status === 'FINISHED') hint.hasFinishedProduction = true;
    if (row.status === 'QUEUED' || row.status === 'IN_PROGRESS') hint.hasActiveDeploy = true;
  }
  return map;
}

export function applyReconciledStatus<T extends { id: string; status: ServiceStatus }>(
  service: T,
  hint: DeployHint | undefined,
): T {
  if (!hint) return service;
  const status = reconcileServiceStatus(service.status, hint);
  return status === service.status ? service : { ...service, status };
}
