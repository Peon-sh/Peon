import { describe, expect, it } from 'vitest';
import { buildPreviewCommentBody, previewCommentMarker } from '../pr-comments';

describe('buildPreviewCommentBody', () => {
  const base = {
    serviceId: 'svc_1',
    serviceName: 'WebApp',
    commitSha: '0bc2c5eabcdef',
    updatedAt: new Date('2026-07-17T14:39:00.000Z'),
  };

  it('includes sticky marker', () => {
    const body = buildPreviewCommentBody({ ...base, phase: 'building' });
    expect(body.startsWith(previewCommentMarker('svc_1'))).toBe(true);
  });

  it('renders a Vercel-style table while building', () => {
    const body = buildPreviewCommentBody({
      ...base,
      phase: 'building',
      fqdn: 'https://0bc2c5e.preview.peon.sh',
      detailsUrl: 'https://app.peon.sh/projects/p1/services/svc_1/deployments/d1',
    });
    expect(body).toContain('The latest updates on your projects.');
    expect(body).toContain('[Peon](https://peon.sh)');
    expect(body).toContain('| Project | Deployment | Actions | Updated (UTC) |');
    expect(body).toContain('**WebApp** (`0bc2c5e`)');
    expect(body).toContain('🟡 [Building](https://app.peon.sh/projects/p1/services/svc_1/deployments/d1)');
    expect(body).toContain('_Pending_');
    expect(body).toContain('Jul 17, 2026');
  });

  it('links Preview when ready', () => {
    const body = buildPreviewCommentBody({
      ...base,
      phase: 'ready',
      fqdn: 'https://0bc2c5e.preview.peon.sh',
    });
    expect(body).toContain('🟢');
    expect(body).toContain('[Ready](https://0bc2c5e.preview.peon.sh)');
    expect(body).toContain('[Preview](https://0bc2c5e.preview.peon.sh)');
  });

  it('includes collapsed error on failure', () => {
    const body = buildPreviewCommentBody({
      ...base,
      phase: 'failed',
      error: 'Image build failed.',
    });
    expect(body).toContain('🔴 Failed');
    expect(body).toContain('<details>');
    expect(body).toContain('Image build failed.');
  });

  it('renders stopped state', () => {
    const body = buildPreviewCommentBody({ ...base, phase: 'stopped' });
    expect(body).toContain('⚪ Stopped');
    expect(body).toContain('| — |');
  });
});
