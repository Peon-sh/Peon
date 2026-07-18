import { prisma } from '@/lib/prisma';
import type { UpsertVolumeInput } from '@/schemas/service.schema';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

export function listVolumes(serviceId: string) {
  return prisma.persistentVolume.findMany({
    where: { serviceId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createVolume(serviceId: string, input: UpsertVolumeInput) {
  const volume = await prisma.persistentVolume.create({
    data: {
      serviceId,
      name: input.name,
      mountPath: input.mountPath,
      hostPath: input.hostPath ?? null,
      isBindMount: input.isBindMount,
    },
  });
  await recordServiceAudit(serviceId, {
    action: 'service.volume.created',
    summary: `Created volume "${volume.name}"`,
    metadata: { volumeId: volume.id, name: volume.name },
  });
  return volume;
}

export async function deleteVolume(serviceId: string, volumeId: string) {
  const volume = await prisma.persistentVolume.findFirst({
    where: { id: volumeId, serviceId },
    select: { id: true, name: true },
  });
  await prisma.persistentVolume.deleteMany({ where: { id: volumeId, serviceId } });
  if (volume) {
    await recordServiceAudit(serviceId, {
      action: 'service.volume.deleted',
      summary: `Deleted volume "${volume.name}"`,
      metadata: { volumeId: volume.id, name: volume.name },
    });
  }
}
