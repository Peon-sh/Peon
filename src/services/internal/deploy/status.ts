import type { DeploymentStatus, ServiceStatus } from '@/lib/prisma';

/** Thrown when a deployment is cancelled mid-run; must not be recorded as FAILED. */
export class DeploymentCancelledError extends Error {
  constructor(message = 'Deployment cancelled') {
    super(message);
    this.name = 'DeploymentCancelledError';
  }
}

export function isCancellableStatus(status: DeploymentStatus): boolean {
  return status === 'QUEUED' || status === 'IN_PROGRESS';
}

/**
 * Status to persist after a failed deploy.
 * If a prior production FINISHED exists, containers are still serving that release — keep RUNNING.
 * Only mark DEGRADED when there is no successful production release to fall back to.
 */
export function statusAfterFailedDeploy(hasPriorFinishedProduction: boolean): ServiceStatus {
  return hasPriorFinishedProduction ? 'RUNNING' : 'DEGRADED';
}

/** Status after cancel: restore RUNNING when a prior success is still the live release. */
export function statusAfterCancelledDeploy(hasPriorFinishedProduction: boolean): ServiceStatus {
  return hasPriorFinishedProduction ? 'RUNNING' : 'UNKNOWN';
}

/**
 * Reconcile stored service status with deployment history for API/UI.
 * Prevents a later failed attempt from looking like the live release is unhealthy
 * when an older FINISHED deploy is still production.
 */
export function reconcileServiceStatus(
  stored: ServiceStatus,
  opts: {
    latestNonPreviewStatus?: DeploymentStatus | null;
    hasFinishedProduction: boolean;
    hasActiveDeploy: boolean;
  },
): ServiceStatus {
  if (opts.hasActiveDeploy) return 'STARTING';
  if (stored === 'STOPPED') return 'STOPPED';

  const latest = opts.latestNonPreviewStatus;
  if (latest === 'FINISHED') return 'RUNNING';
  if (latest === 'FAILED') {
    return statusAfterFailedDeploy(opts.hasFinishedProduction);
  }
  if (latest === 'CANCELLED') {
    return statusAfterCancelledDeploy(opts.hasFinishedProduction);
  }
  return stored;
}
