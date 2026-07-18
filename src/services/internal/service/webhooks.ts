import { prisma } from '@/lib/prisma';
import { randomToken } from './shared';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

export function listWebhooks(serviceId: string) {
  return prisma.serviceWebhook.findMany({
    where: { serviceId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWebhook(serviceId: string, provider: string) {
  const webhook = await prisma.serviceWebhook.create({
    data: { serviceId, provider, token: randomToken(24) },
  });
  await recordServiceAudit(serviceId, {
    action: 'service.webhook.created',
    summary: `Created ${provider} webhook`,
    metadata: { webhookId: webhook.id, provider },
  });
  return webhook;
}

export async function deleteWebhook(serviceId: string, webhookId: string) {
  await prisma.serviceWebhook.deleteMany({ where: { id: webhookId, serviceId } });
  await recordServiceAudit(serviceId, {
    action: 'service.webhook.deleted',
    summary: `Deleted webhook`,
    metadata: { webhookId },
  });
}
