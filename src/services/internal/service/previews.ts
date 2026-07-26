import { prisma } from '@/lib/prisma';
import { executorForServer } from '@/lib/executor';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

import { servicesBaseDir } from '@/lib/paths';

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
      const executor = await executorForServer(preview.service.serverId);
      const dir = `${servicesBaseDir()}/${preview.service.uuid}/pr-${preview.pullRequestId}`;
      await executor.exec(
        `if [ -f ${dir}/docker-compose.yml ]; then cd ${dir} && docker compose down --remove-orphans || true; fi`,
      );
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
