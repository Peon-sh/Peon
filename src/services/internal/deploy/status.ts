import type { DeploymentStatus, ServiceStatus } from '@/lib/prisma';

/** Thrown when a deployment is cancelled mid-run; must not be recorded as FAILED. */
export class DeploymentCancelledError extends Error {
  constructor(message = 'Deployment cancelled') {
    super(message);
    this.name = 'DeploymentCancelledError';
  }
}

/**
 * Thrown when `docker compose up -d` fails while resuming a suspended service —
 * typically because docker cleanup pruned the image while it was suspended.
 * The worker catches this and falls back to a full deployment.
 */
export class ResumeFailedError extends Error {
  constructor(message = 'Resume failed') {
    super(message);
    this.name = 'ResumeFailedError';
  }
}

/** Actions accepted by the service control endpoint and the `service.control` job. */
export type ServiceControlAction = 'start' | 'stop' | 'restart' | 'suspend' | 'resume';

/** Status to persist once the worker has applied a control action on the host. */
export function statusAfterControl(action: ServiceControlAction): ServiceStatus {
  if (action === 'suspend') return 'SUSPENDED';
  if (action === 'stop') return 'STOPPED';
  return 'RUNNING';
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
    isSuspended?: boolean;
  },
): ServiceStatus {
  // Suspension is desired state and outranks anything deployment history implies:
  // a FINISHED deploy from before the suspension must not read back as RUNNING.
  if (opts.isSuspended) return 'SUSPENDED';
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
