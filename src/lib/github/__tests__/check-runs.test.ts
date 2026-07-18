import { describe, expect, it } from 'vitest';
import { buildPreviewCheckRunPayload, previewCheckRunName } from '../check-runs';

describe('buildPreviewCheckRunPayload', () => {
  const base = {
    serviceId: 'svc_1',
    serviceName: 'WebApp',
    headSha: '0bc2c5eabcdef0123456789',
  };

  it('names the check like Vercel', () => {
    expect(previewCheckRunName('WebApp')).toBe('Peon Preview — WebApp');
  });

  it('emits in_progress while building', () => {
    const payload = buildPreviewCheckRunPayload({
      ...base,
      phase: 'building',
      fqdn: 'https://0bc2c5e.preview.peon.sh',
      detailsUrl: 'https://app.peon.sh/d/1',
    });
    expect(payload.name).toBe('Peon Preview — WebApp');
    expect(payload.status).toBe('in_progress');
    expect(payload.conclusion).toBeUndefined();
    expect(payload.details_url).toBe('https://app.peon.sh/d/1');
    expect(payload.output.title).toBe('Building preview');
  });

  it('completes success with preview URL', () => {
    const payload = buildPreviewCheckRunPayload({
      ...base,
      phase: 'ready',
      fqdn: 'https://0bc2c5e.preview.peon.sh',
      detailsUrl: 'https://app.peon.sh/d/1',
    });
    expect(payload.status).toBe('completed');
    expect(payload.conclusion).toBe('success');
    expect(payload.details_url).toBe('https://0bc2c5e.preview.peon.sh');
    expect(payload.output.summary).toContain('https://0bc2c5e.preview.peon.sh');
  });

  it('completes failure with error text', () => {
    const payload = buildPreviewCheckRunPayload({
      ...base,
      phase: 'failed',
      error: 'Image build failed.',
    });
    expect(payload.status).toBe('completed');
    expect(payload.conclusion).toBe('failure');
    expect(payload.output.text).toContain('Image build failed.');
  });

  it('cancels when stopped', () => {
    const payload = buildPreviewCheckRunPayload({ ...base, phase: 'stopped' });
    expect(payload.status).toBe('completed');
    expect(payload.conclusion).toBe('cancelled');
  });
});
