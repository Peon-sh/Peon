import { prisma } from '@/lib/prisma';
import { sshTargetForServer } from '@/lib/ssh';
import { tearDownPreviewStack } from '@/services/internal/deploy/preview-teardown';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

const BASE_DIR = '/data/peon/services';

export function listPreviews(serviceId: string) {
  return prisma.servicePreview.findMany({
    where: { serviceId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Stop preview containers on the server (best-effort), then remove the DB row. */
export async function deletePreview(serviceId: string, previewId: string) {
  const preview = await prisma.servicePreview.findFirst({
    where: { id: previewId, serviceId },
    select: {
      id: true,
      pullRequestId: true,
      service: { select: { uuid: true, serverId: true } },
    },
  });
  if (!preview) return;

  if (preview.service.serverId) {
    try {
      const target = await sshTargetForServer(preview.service.serverId);
      await tearDownPreviewStack(target, {
        serviceId,
        serviceUuid: preview.service.uuid,
        pullRequestId: preview.pullRequestId,
        dir: `${BASE_DIR}/${preview.service.uuid}/pr-${preview.pullRequestId}`,
      });
    } catch (err) {
      console.error(
        `[preview] teardown failed for ${serviceId} PR #${preview.pullRequestId}:`,
        err,
      );
    }
  }

  await prisma.servicePreview.delete({ where: { id: preview.id } });
  await recordServiceAudit(serviceId, {
    action: 'service.preview.deleted',
    summary: `Deleted preview for PR #${preview.pullRequestId}`,
    metadata: { previewId, pullRequestId: preview.pullRequestId },
  });
}
