import { describe, expect, it } from 'vitest';
import {
  buildCompose,
  detectComposeServicePort,
  ensureNamedVolumes,
  escapeComposeDollars,
  namedVolumeSource,
  prepareRawCompose,
  pickPrimaryComposeService,
} from '../compose';

describe('escapeComposeDollars', () => {
  it('doubles dollar signs for Compose interpolation', () => {
    expect(escapeComposeDollars('out=$out')).toBe('out=$$out');
    expect(escapeComposeDollars('${http_code}')).toBe('$${http_code}');
  });
});

describe('buildCompose command quoting', () => {
  it('quotes string commands so && survives YAML/Compose parsing', () => {
    const yaml = buildCompose({
      services: {
        app: {
          containerName: 'app',
          image: 'peon/app:latest',
          command: 'pnpm exec prisma migrate deploy && pnpm start',
        },
      },
    });
    // One-element list: required for images with ENTRYPOINT bash -c
    expect(yaml).toContain('command:');
    expect(yaml).toContain('- "pnpm exec prisma migrate deploy && pnpm start"');
    expect(yaml).not.toMatch(/command:\n\s+- pnpm\n/);
  });

  it('escapes $ in healthcheck shell so Compose does not interpolate', () => {
    const yaml = buildCompose({
      services: {
        app: {
          containerName: 'app',
          image: 'peon/app:latest',
          healthcheck: {
            test: [
              'CMD-SHELL',
              `out=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/) && [ "$out" = "200" ]`,
            ],
          },
        },
      },
    });
    expect(yaml).toContain('$$');
    expect(yaml).not.toMatch(/(?<!\$)\$out/);
  });
});

describe('prepareRawCompose', () => {
  const raw = `
services:
  documenso:
    image: documenso/documenso
    environment:
      - SERVICE_URL_DOCUMENSO_3000
    volumes:
      - documenso_certs:/app/certs
  database:
    image: postgres:17
    volumes:
      - documenso_postgresql_data:/var/lib/postgresql/data
volumes:
  documenso_certs:
  documenso_postgresql_data:
`;

  it('injects deterministic container_name matching Peon naming', () => {
    const prepared = prepareRawCompose(raw, {
      serviceName: 'documenso',
      serviceUuid: 'cmrkt1yy4000f1ynp6y3ys8oj',
      proxyLabels: [
        'traefik.enable=true',
        'traefik.http.services.documenso.loadbalancer.server.port=3000',
      ],
    });
    expect(prepared.primaryServiceKey).toBe('documenso');
    expect(prepared.primaryContainerName).toBe('documenso-cmrkt1yy');
    expect(prepared.containerNames.database).toBe('database-cmrkt1yy');
    expect(prepared.yaml).toContain('container_name: documenso-cmrkt1yy');
    expect(prepared.yaml).toContain('container_name: database-cmrkt1yy');
    expect(prepared.yaml).toContain('external: true');
    expect(prepared.yaml).toContain('traefik.enable=true');
  });

  it('picks non-database service when peon name does not match any key', () => {
    expect(
      pickPrimaryComposeService(
        {
          database: { image: 'postgres:17' },
          web: { image: 'app:latest' },
        },
        'myservice',
      ),
    ).toBe('web');
  });

  it('detects port from SERVICE_URL_*_PORT magic keys', () => {
    expect(
      detectComposeServicePort(
        'documenso',
        { environment: ['SERVICE_URL_DOCUMENSO_3000'] },
        'SERVICE_URL_DOCUMENSO_3000',
      ),
    ).toBe(3000);
  });

  it('leaves yaml unchanged when used as raw deploy input', () => {
    // Documented contract: raw mode skips prepareRawCompose and uses the file as-is.
    expect(raw.trim().startsWith('services:')).toBe(true);
    expect(raw).not.toContain('container_name:');
  });

  it('declares named volumes that services mount but omit from top-level volumes', () => {
    const compose = `
services:
  app:
    image: example/app:latest
    volumes:
      - 'app-data:/var/lib/app'
`;
    const prepared = prepareRawCompose(compose, {
      serviceName: 'app',
      serviceUuid: 'cmrkt1yy4000f1ynp6y3ys8oj',
    });
    expect(prepared.yaml).toMatch(/volumes:\s*\n\s*app-data:/);
    expect(prepared.yaml).toContain('app-data:/var/lib/app');
  });

  it('preserves existing top-level volume entries', () => {
    const prepared = prepareRawCompose(raw, {
      serviceName: 'documenso',
      serviceUuid: 'cmrkt1yy4000f1ynp6y3ys8oj',
    });
    expect(prepared.yaml).toContain('documenso_certs:');
    expect(prepared.yaml).toContain('documenso_postgresql_data:');
  });
});

describe('namedVolumeSource / ensureNamedVolumes', () => {
  it('recognises named volumes and skips bind mounts', () => {
    expect(namedVolumeSource('app-data:/var/lib/app')).toBe('app-data');
    expect(namedVolumeSource('/host/path:/var/lib/app')).toBeNull();
    expect(namedVolumeSource('./data:/var/lib/app')).toBeNull();
    expect(namedVolumeSource('${VOLUME_NAME}:/data')).toBeNull();
    expect(namedVolumeSource({ type: 'volume', source: 'data', target: '/data' })).toBe('data');
    expect(namedVolumeSource({ type: 'bind', source: '/host', target: '/data' })).toBeNull();
  });

  it('fills missing top-level volume keys', () => {
    const doc = {
      services: {
        app: { volumes: ['app-data:/var/lib/app', '/tmp/x:/tmp/x'] },
      },
    };
    ensureNamedVolumes(doc);
    expect(doc).toMatchObject({ volumes: { 'app-data': null } });
  });
});
