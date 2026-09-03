import { describe, expect, it } from 'vitest';
import { parseDomain } from '@/lib/docker/labels';
import { generateMagicEnv } from '@/lib/templates/magic-env';

const ctx = {
  serviceSlug: 'n8n',
  serviceUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  baseDomain: '1.2.3.4.sslip.io',
};

describe('magic env SERVICE_URL scheme', () => {
  it('emits https URLs alongside the bare FQDN', () => {
    const env = generateMagicEnv('SERVICE_URL_N8N_5678', { ...ctx, https: true });

    expect(env.SERVICE_FQDN_N8N_5678).toBe('n8n-aaaaaaaa.1.2.3.4.sslip.io');
    expect(env.SERVICE_URL_N8N_5678).toBe('https://n8n-aaaaaaaa.1.2.3.4.sslip.io');
  });

  // The proxy derives the scheme from the domain string, so these two have to
  // agree: a bare hostname gets a TLS router with a Let's Encrypt cert, and an
  // app told `http://` would hand the browser links it then blocks.
  it('agrees with the scheme the proxy serves that host on', () => {
    const env = generateMagicEnv('SERVICE_URL_N8N_5678', { ...ctx, https: true });

    const host = env.SERVICE_FQDN_N8N_5678!;
    expect(parseDomain(host).scheme).toBe('https');
    expect(env.SERVICE_URL_N8N_5678).toBe(`https://${host}`);
  });

  it('still emits http when asked, for hosts with no proxy in front', () => {
    const env = generateMagicEnv('SERVICE_URL_N8N_5678', {
      ...ctx,
      baseDomain: null,
      https: false,
    });

    expect(env.SERVICE_URL_N8N_5678).toBe('http://n8n-aaaaaaaa.localhost');
  });

  it('gives the FQDN twin the same host as the URL', () => {
    const env = generateMagicEnv('SERVICE_FQDN_APP', { ...ctx, https: true });

    expect(env.SERVICE_URL_APP).toBe(`https://${env.SERVICE_FQDN_APP}`);
  });
});
