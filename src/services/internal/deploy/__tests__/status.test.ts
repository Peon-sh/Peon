import { describe, it, expect } from 'vitest';
import {
  DeploymentCancelledError,
  isCancellableStatus,
  reconcileServiceStatus,
  statusAfterCancelledDeploy,
  statusAfterFailedDeploy,
} from '../status';

describe('isCancellableStatus', () => {
  it('allows queued and in-progress deployments', () => {
    expect(isCancellableStatus('QUEUED')).toBe(true);
    expect(isCancellableStatus('IN_PROGRESS')).toBe(true);
  });

  it('rejects terminal statuses', () => {
    expect(isCancellableStatus('FINISHED')).toBe(false);
    expect(isCancellableStatus('FAILED')).toBe(false);
    expect(isCancellableStatus('CANCELLED')).toBe(false);
  });
});

describe('DeploymentCancelledError', () => {
  it('is identifiable by name and instanceof', () => {
    const err = new DeploymentCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DeploymentCancelledError);
    expect(err.name).toBe('DeploymentCancelledError');
    expect(err.message).toBe('Deployment cancelled');
  });
});

describe('statusAfterFailedDeploy', () => {
  it('keeps RUNNING when a prior production release exists', () => {
    expect(statusAfterFailedDeploy(true)).toBe('RUNNING');
  });

  it('marks DEGRADED when no prior success exists', () => {
    expect(statusAfterFailedDeploy(false)).toBe('DEGRADED');
  });
});

describe('statusAfterCancelledDeploy', () => {
  it('restores RUNNING when a prior production release exists', () => {
    expect(statusAfterCancelledDeploy(true)).toBe('RUNNING');
  });

  it('falls back to UNKNOWN when no prior success exists', () => {
    expect(statusAfterCancelledDeploy(false)).toBe('UNKNOWN');
  });
});

describe('reconcileServiceStatus', () => {
  it('shows STARTING while a deploy is active', () => {
    expect(
      reconcileServiceStatus('RUNNING', {
        latestNonPreviewStatus: 'IN_PROGRESS',
        hasFinishedProduction: true,
        hasActiveDeploy: true,
      }),
    ).toBe('STARTING');
  });

  it('keeps STOPPED regardless of deployment history', () => {
    expect(
      reconcileServiceStatus('STOPPED', {
        latestNonPreviewStatus: 'FINISHED',
        hasFinishedProduction: true,
        hasActiveDeploy: false,
      }),
    ).toBe('STOPPED');
  });

  it('heals DEGRADED when latest failed but a prior success is still live', () => {
    expect(
      reconcileServiceStatus('DEGRADED', {
        latestNonPreviewStatus: 'FAILED',
        hasFinishedProduction: true,
        hasActiveDeploy: false,
      }),
    ).toBe('RUNNING');
  });
});
