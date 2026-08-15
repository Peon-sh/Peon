import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/lib/errors';

/**
 * Suspension guard shared by every path that could bring a service back up:
 * manual deploy, rollback, start/restart, git webhooks, and the cron scheduler.
 *
 * `Service.suspendedAt` is desired state — it is written synchronously by the
 * API layer before the worker job is enqueued, so a push arriving moments after
 * a suspend already sees it.
 */

/** Reason string reported by webhook handlers when a push is ignored. */
export const SUSPENDED_REASON = 'service suspended';

export function isSuspended(svc: { suspendedAt: Date | null }): boolean {
  return svc.suspendedAt !== null;
}

/**
 * Throws when the service is suspended. Call before creating a Deployment.
 * `verb` completes the sentence "Resume it before you … it".
 */
export async function assertNotSuspended(serviceId: string, verb = 'deploy'): Promise<void> {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { suspendedAt: true },
  });
  if (!svc) throw new NotFoundError('Service not found.');
  if (isSuspended(svc)) {
    throw new ConflictError(`Service is suspended. Resume it before you ${verb} it.`);
  }
}
