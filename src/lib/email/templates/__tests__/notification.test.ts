import { describe, expect, it } from 'vitest';
import { notificationEmailTemplate } from '../notification';

describe('notificationEmailTemplate', () => {
  it('wraps content in the Peon email shell with a CTA', () => {
    const rendered = notificationEmailTemplate({
      subject: 'Deployment failed · demo',
      text: 'Service "demo" failed to deploy: Image build failed.',
      severity: 'error',
      fields: [
        { label: 'Project', value: 'Acme' },
        { label: 'Service', value: 'demo' },
        { label: 'Error', value: 'Image build failed.' },
      ],
      links: [
        { label: 'View logs', url: 'https://app.peon.sh/logs' },
        { label: 'Open app', url: 'https://demo.example.com' },
      ],
    });

    expect(rendered.subject).toContain('Deployment failed · demo');
    expect(rendered.html).toContain('peon.sh/logos/logo-500.png');
    expect(rendered.html).toContain('View logs');
    expect(rendered.html).toContain('https://app.peon.sh/logs');
    expect(rendered.html).toContain('Image build failed.');
    expect(rendered.html).toContain('Failed');
    expect(rendered.text).toContain('View logs: https://app.peon.sh/logs');
  });
});
