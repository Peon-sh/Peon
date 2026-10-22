import { describe, expect, it } from 'vitest';
import { composeConfigSections } from '@/lib/service-config';

describe('composeConfigSections', () => {
  it('asks for a Cloudflared tunnel token even when no env vars exist yet', () => {
    const sections = composeConfigSections('cloudflared', []);
    const field = sections
      .flatMap((section) => section.fields)
      .find((f) => f.key === 'CLOUDFLARE_TUNNEL_TOKEN');
    expect(field).toMatchObject({
      key: 'CLOUDFLARE_TUNNEL_TOKEN',
      source: 'env',
      isPassword: true,
      required: true,
    });
    expect(field?.helper).toContain('Zero Trust');
  });
});
