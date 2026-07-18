import { describe, it, expect } from 'vitest';
import { parseDomain, generateTraefikLabels, generateCaddyLabels } from '../labels';
import { buildCompose } from '../compose';

describe('parseDomain', () => {
  it('defaults to https', () => {
    expect(parseDomain('example.com')).toEqual({ scheme: 'https', host: 'example.com' });
  });
  it('parses scheme and path', () => {
    expect(parseDomain('http://example.com/api')).toEqual({
      scheme: 'http',
      host: 'example.com',
      path: '/api',
    });
  });
});

describe('generateTraefikLabels', () => {
  it('emits enable + host rule + service port', () => {
    const labels = generateTraefikLabels({
      name: 'app',
      domains: ['https://example.com'],
      port: 3000,
      forceHttps: true,
    });
    expect(labels).toContain('traefik.enable=true');
    expect(labels.some((l) => l.includes('Host(`example.com`)'))).toBe(true);
    expect(labels).toContain('traefik.http.services.app.loadbalancer.server.port=3000');
  });

  it('returns only enable when no domains', () => {
    const labels = generateTraefikLabels({ name: 'app', domains: [], port: 80 });
    expect(labels).toEqual(['traefik.enable=true']);
  });
});

describe('generateCaddyLabels', () => {
  it('emits caddy reverse proxy', () => {
    const labels = generateCaddyLabels({ name: 'app', domains: ['example.com'], port: 8080 });
    expect(labels).toContain('caddy=example.com');
    expect(labels.some((l) => l.startsWith('caddy.reverse_proxy'))).toBe(true);
  });
});

describe('buildCompose', () => {
  it('produces a valid compose document', () => {
    const yaml = buildCompose({
      services: {
        web: { containerName: 'web-1', image: 'nginx:alpine', env: { FOO: 'bar' } },
      },
      network: 'peon',
    });
    expect(yaml).toContain('image: nginx:alpine');
    expect(yaml).toContain('container_name: web-1');
    expect(yaml).toContain('peon');
  });
});
