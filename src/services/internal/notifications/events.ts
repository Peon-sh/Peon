import { prisma } from '@/lib/prisma';
import {
  NotificationService,
  type NotificationEvent,
  type NotificationMessage,
} from './notifications';

/** Dispatch an event for a service by resolving its workspace via project. */
export async function notifyService(
  serviceId: string,
  event: NotificationEvent,
  message: NotificationMessage,
): Promise<void> {
  try {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { project: { select: { workspaceId: true } } },
    });
    const workspaceId = service?.project?.workspaceId;
    if (!workspaceId) return;
    await NotificationService.dispatch(workspaceId, event, message);
  } catch (err) {
    console.error('[notifications] notifyService failed:', err instanceof Error ? err.message : err);
  }
}

/** Dispatch an event for a server by resolving its workspace directly. */
export async function notifyServer(
  serverId: string,
  event: NotificationEvent,
  message: NotificationMessage,
): Promise<void> {
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { workspaceId: true },
    });
    if (!server?.workspaceId) return;
    await NotificationService.dispatch(server.workspaceId, event, message);
  } catch (err) {
    console.error('[notifications] notifyServer failed:', err instanceof Error ? err.message : err);
  }
}
