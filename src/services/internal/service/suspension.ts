import { ConflictError } from '@/lib/errors';

/**
 * Suspension logic shared by every path that could bring a service back up:
 * manual deploy, rollback, start/restart, git webhooks, PR previews, the deploy
 * engine, and the cron scheduler.
 *
 * `Service.suspendedAt` is desired state — it is written synchronously by the
 * API layer before the worker job is enqueued, so a push arriving moments after
 * a suspend already sees it.
 */

/** Anything carrying the desired-state column; accepts partial Prisma selects. */
type SuspendableService = { suspendedAt?: Date | null };

/** Reason string reported by webhook and preview handlers when a trigger is ignored. */
export const SUSPENDED_REASON = 'service suspended';

export function isSuspended(svc: SuspendableService): boolean {
  return svc.suspendedAt != null;
}

/**
 * Throws on the paths that answer a user directly (API, MCP). Callers that skip
 * silently — webhooks, previews, the scheduler — use `isSuspended` with
 * `SUSPENDED_REASON` instead.
 *
 * Takes the already-loaded service rather than an id so a guard never costs an
 * extra query; `activity` completes the sentence "Resume it before …".
 */
export function assertNotSuspended(svc: SuspendableService, activity = 'deploying'): void {
  if (isSuspended(svc)) {
    throw new ConflictError(`Service is suspended. Resume it before ${activity}.`);
  }
}
