import { describe, expect, it } from 'vitest';
import {
  PREVIEW_DEPLOYMENT_ENVIRONMENT,
  buildPreviewDeploymentCreatePayload,
  buildPreviewDeploymentStatusPayload,
} from '../deployments';

describe('buildPreviewDeploymentCreatePayload', () => {
  it('creates a transient Preview deployment for the commit sha', () => {
    const payload = buildPreviewDeploymentCreatePayload({
      headSha: '0bc2c5eabcdef0123456789',
      serviceName: 'WebApp',
    });
    expect(payload).toEqual({
      ref: '0bc2c5eabcdef0123456789',
      environment: PREVIEW_DEPLOYMENT_ENVIRONMENT,
      description: 'Peon preview for WebApp',
      auto_merge: false,
      required_contexts: [],
      transient_environment: true,
      production_environment: false,
    });
  });
});

describe('buildPreviewDeploymentStatusPayload', () => {
  const base = { serviceName: 'WebApp' };

  it('emits in_progress while building', () => {
    const payload = buildPreviewDeploymentStatusPayload({
      ...base,
      phase: 'building',
      logUrl: 'https://app.peon.sh/d/1',
      environmentUrl: 'https://0bc2c5e.preview.peon.sh',
    });
    expect(payload.state).toBe('in_progress');
    expect(payload.environment).toBe('Preview');
    expect(payload.log_url).toBe('https://app.peon.sh/d/1');
    expect(payload.environment_url).toBe('https://0bc2c5e.preview.peon.sh');
    expect(payload.auto_inactive).toBeUndefined();
  });

  it('emits success with environment URL and auto_inactive', () => {
    const payload = buildPreviewDeploymentStatusPayload({
      ...base,
      phase: 'ready',
      logUrl: 'https://app.peon.sh/d/1',
      environmentUrl: 'https://0bc2c5e.preview.peon.sh/',
    });
    expect(payload.state).toBe('success');
    expect(payload.auto_inactive).toBe(true);
    expect(payload.environment_url).toBe('https://0bc2c5e.preview.peon.sh');
  });

  it('emits failure with truncated error description', () => {
    const payload = buildPreviewDeploymentStatusPayload({
      ...base,
      phase: 'failed',
      error: 'Image build failed.',
    });
    expect(payload.state).toBe('failure');
    expect(payload.description).toBe('Image build failed.');
  });

  it('emits inactive when stopped', () => {
    const payload = buildPreviewDeploymentStatusPayload({
      ...base,
      phase: 'stopped',
    });
    expect(payload.state).toBe('inactive');
    expect(payload.description).toContain('stopped');
  });
});
