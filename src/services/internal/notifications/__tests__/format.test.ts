import { describe, expect, it } from 'vitest';
import {
  absolutePublicUrl,
  buildDiscordPayload,
  buildSlackPayload,
  titledSubject,
} from '../format';

describe('notification format', () => {
  it('adds https to bare FQDNs', () => {
    expect(absolutePublicUrl('app.example.com')).toBe('https://app.example.com');
    expect(absolutePublicUrl('https://app.example.com')).toBe('https://app.example.com');
    expect(absolutePublicUrl('a.com, b.com')).toBe('https://a.com');
  });

  it('prefixes severity emoji on the subject', () => {
    expect(titledSubject('error', 'Deployment failed · demo')).toBe('❌ Deployment failed · demo');
    expect(titledSubject('success', 'Deployment succeeded · demo')).toBe(
      '✅ Deployment succeeded · demo',
    );
  });

  it('builds a colored Slack Block Kit payload with actions', () => {
    const payload = buildSlackPayload({
      subject: 'Deployment failed · bhaShaIME',
      text: 'Service "bhaShaIME" failed to deploy: Image build failed.',
      severity: 'error',
      fields: [
        { label: 'Project', value: 'Acme' },
        { label: 'Service', value: 'bhaShaIME' },
        { label: 'Error', value: 'Image build failed.' },
        { label: 'App', value: 'app.example.com' },
      ],
      links: [
        { label: 'View logs', url: 'https://peon.example/logs' },
        { label: 'Open app', url: 'https://app.example.com' },
      ],
    });

    expect(payload.text).toBe('❌ Deployment failed · bhaShaIME');
    const attachment = (payload.attachments as Array<{ color: string; blocks: unknown[] }>)[0];
    expect(attachment.color).toBe('#E01E5A');
    expect(JSON.stringify(attachment.blocks)).toContain('Image build failed');
    expect(JSON.stringify(attachment.blocks)).toContain('View logs');
    expect(JSON.stringify(attachment.blocks)).toContain('"type":"actions"');
  });

  it('builds a Discord embed with severity color', () => {
    const payload = buildDiscordPayload({
      subject: 'Deployment succeeded · demo',
      text: 'New version is live.',
      severity: 'success',
      fields: [{ label: 'Service', value: 'demo' }],
      links: [{ label: 'Open app', url: 'https://demo.example.com' }],
    });
    expect(payload.content).toBe('✅ Deployment succeeded · demo');
    const embed = (payload.embeds as Array<{ color: number; title: string }>)[0];
    expect(embed.color).toBe(0x2eb67d);
    expect(embed.title).toContain('✅');
  });
});
