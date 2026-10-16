import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { detectComposeServicePort, pickPrimaryComposeService } from '@/lib/docker/compose';
import { getTemplate, listTemplates } from '@/lib/templates';

describe('template catalog logos', () => {
  it('exposes a public logo path for every template', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThan(300);
    for (const t of templates) {
      expect(t.logo, t.slug).toMatch(/^\/svgs\/.+\.(svg|png|webp|jpg|jpeg|ico)$/);
    }
  });

  it('resolves logo files under public/', () => {
    const publicDir = join(process.cwd(), 'public');
    const samples = ['n8n', 'ghost', 'umami', 'opnform', 'pgbackweb', 'wordpress-with-mysql'];
    for (const slug of samples) {
      const t = getTemplate(slug);
      expect(t?.logo, slug).toBeTruthy();
      expect(existsSync(join(publicDir, t!.logo!)), `${slug} -> ${t!.logo}`).toBe(true);
    }
  });
});

const COOLIFY_VOLUME_KEYS = new Set(['content', 'is_directory', 'isDirectory']);

function namedVolumeSources(volumes: unknown[] | undefined): string[] {
  const sources: string[] = [];
  for (const mount of volumes ?? []) {
    if (typeof mount !== 'string') continue;
    const source = mount.split(':')[0];
    if (!source || source.startsWith('/')) continue;
    sources.push(source);
  }
  return sources;
}

describe('template catalog compose', () => {
  const templates = listTemplates();

  it('decodes as YAML with at least one service image', () => {
    for (const t of templates) {
      const detail = getTemplate(t.slug);
      expect(detail, t.slug).toBeTruthy();
      const doc = parse(detail!.compose) as {
        services?: Record<string, Record<string, unknown>>;
      };
      const services = doc?.services;
      expect(services && Object.keys(services).length, t.slug).toBeGreaterThan(0);
      for (const [key, svc] of Object.entries(services!)) {
        expect(svc, `${t.slug}/${key}`).toBeTruthy();
        expect(svc.image || svc.build, `${t.slug}/${key} image`).toBeTruthy();
        expect(svc, `${t.slug}/${key}`).not.toHaveProperty('exclude_from_hc');
      }
    }
  });

  it('does not use Coolify-only volume fields Docker Compose rejects', () => {
    for (const t of templates) {
      const detail = getTemplate(t.slug)!;
      const doc = parse(detail.compose) as {
        services?: Record<string, Record<string, unknown>>;
      };
      for (const [key, svc] of Object.entries(doc.services ?? {})) {
        const mounts = svc.volumes;
        if (!Array.isArray(mounts)) continue;
        for (const mount of mounts) {
          if (!mount || typeof mount !== 'object') continue;
          for (const field of COOLIFY_VOLUME_KEYS) {
            expect(mount, `${t.slug}/${key}`).not.toHaveProperty(field);
          }
        }
      }
    }
  });

  it('does not put compose mode suffixes in Docker config target paths', () => {
    for (const t of templates) {
      const detail = getTemplate(t.slug)!;
      const doc = parse(detail.compose) as {
        services?: Record<string, Record<string, unknown>>;
        configs?: Record<string, { content?: unknown; file?: unknown }>;
      };
      for (const [key, svc] of Object.entries(doc.services ?? {})) {
        const cfgs = svc.configs;
        if (!Array.isArray(cfgs)) continue;
        for (const cfg of cfgs) {
          if (!cfg || typeof cfg !== 'object') continue;
          const target = String((cfg as { target?: string }).target ?? '');
          expect(target, `${t.slug}/${key}`).not.toMatch(/:(ro|rw|z|Z)$/);
        }
      }
      for (const [name, cfg] of Object.entries(doc.configs ?? {})) {
        const hasBody = typeof cfg?.content === 'string' || typeof cfg?.file === 'string';
        expect(hasBody, `${t.slug} config ${name}`).toBe(true);
        if (typeof cfg?.content === 'string') {
          expect(cfg.content.length, `${t.slug} config ${name} empty content`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps shared storage on one named volume for multi-service templates', () => {
    const detail = getTemplate('supabase')!;
    const doc = parse(detail.compose) as { services?: Record<string, { volumes?: unknown[] }> };
    const sources = (svc: string) => namedVolumeSources(doc.services?.[svc]?.volumes);
    expect(sources('supabase-minio')).toContain('supabase-volumes-storage');
    expect(sources('supabase-storage')).toContain('supabase-volumes-storage');
    expect(sources('imgproxy')).toContain('supabase-volumes-storage');
    expect(sources('supabase-studio')).toContain('supabase-volumes-functions');
    expect(sources('supabase-edge-functions')).toContain('supabase-volumes-functions');

    const authentik = parse(getTemplate('authentik')!.compose) as {
      services?: Record<string, { volumes?: unknown[] }>;
    };
    const aSources = (svc: string) => namedVolumeSources(authentik.services?.[svc]?.volumes);
    expect(aSources('authentik-server').filter((s) => s.includes('media'))).toEqual(
      aSources('authentik-worker').filter((s) => s.includes('media')),
    );
    expect(aSources('authentik-server').filter((s) => s.includes('template'))).toEqual(
      aSources('authentik-worker').filter((s) => s.includes('template')),
    );
  });

  it('includes SERVICE_URL/FQDN_{primary}_{port} when the catalog has a TCP port', () => {
    for (const t of templates) {
      if (!t.port || !/^\d+$/.test(t.port) || Number(t.port) > 65535) continue;
      const detail = getTemplate(t.slug)!;
      const doc = parse(detail.compose) as {
        services?: Record<string, Record<string, unknown>>;
      };
      const primary = pickPrimaryComposeService(doc.services!, t.slug);
      const id = primary.replace(/-/g, '_').toUpperCase();
      expect(detail.compose, `${t.slug} primary=${primary}`).toMatch(
        new RegExp(`SERVICE_(?:URL|FQDN)_${id}_\\d+`),
      );
      const detected = detectComposeServicePort(
        primary,
        doc.services![primary]!,
        detail.compose,
      );
      expect(detected, `${t.slug} primary=${primary}`).toBe(Number(t.port));
    }
  });

  it('matrix synapse postgresql refuses an empty server name and logs to the console', () => {
    const detail = getTemplate('matrix-synapse-with-postgresql')!;
    const doc = parse(detail.compose) as {
      services?: { synapse?: { environment?: string[]; entrypoint?: string[] } };
    };
    const env = doc.services?.synapse?.environment ?? [];
    const entry = doc.services?.synapse?.entrypoint?.[2] ?? '';
    expect(env.join('\n')).not.toMatch(/SYNAPSE_SERVER_NAME=\$\{SYNAPSE_SERVER_NAME:-/);
    expect(env).toContain('PUBLIC_BASEURL=${PUBLIC_BASEURL:-${SERVICE_URL_SYNAPSE}}');
    expect(entry.indexOf('exit 1')).toBeGreaterThan(-1);
    expect(entry.indexOf('exit 1')).toBeLessThan(entry.indexOf('/start.py generate'));
    expect(entry).toContain('set SYNAPSE_SERVER_NAME to your domain before first deploy');
    const logStart = entry.indexOf("<<'LOGEOF'");
    const logEnd = entry.indexOf('\nLOGEOF', logStart);
    const logBlock = entry.slice(logStart, logEnd);
    expect(logBlock).toContain('class: logging.StreamHandler');
    expect(logBlock).not.toContain('homeserver.log');
    expect(entry).toContain('public_baseurl: "${PUBLIC_BASEURL:-${SERVICE_URL_SYNAPSE}}/"');
  });

  it('does not pull removed Docker Hub MinIO images', () => {
    const removed = /(^|\/)minio\/(minio|mc)(:|$)/;
    for (const t of templates) {
      const detail = getTemplate(t.slug)!;
      const doc = parse(detail.compose) as {
        services?: Record<string, { image?: unknown }>;
      };
      for (const [key, svc] of Object.entries(doc.services ?? {})) {
        const image = typeof svc.image === 'string' ? svc.image : '';
        expect(image, `${t.slug}/${key}`).not.toMatch(removed);
      }
    }
  });

  it('lets Penpot override its public URI and buckets S3 with the bundled client', () => {
    const image = 'ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z';
    const uri = 'PENPOT_PUBLIC_URI=${PENPOT_PUBLIC_URI:-${SERVICE_URL_FRONTEND_8080}}';
    for (const slug of ['penpot', 'penpot-with-s3']) {
      const doc = parse(getTemplate(slug)!.compose) as {
        services?: Record<string, { environment?: string[] }>;
      };
      for (const svc of ['penpot-backend', 'penpot-exporter']) {
        expect(doc.services?.[svc]?.environment ?? [], `${slug}/${svc}`).toContain(uri);
      }
    }
    const s3 = parse(getTemplate('penpot-with-s3')!.compose) as {
      services?: { 'minio-init'?: { image?: string } };
    };
    expect(s3.services?.['minio-init']?.image).toBe(image);
  });

  it('lets Plane override its public URL and allows that origin in CORS', () => {
    const compose = getTemplate('plane')!.compose;
    expect(compose).toContain("APP_DOMAIN: '${APP_DOMAIN:-${SERVICE_URL_PLANE}}'");
    expect(compose).toContain('APP_DOMAIN=${APP_DOMAIN:-${SERVICE_URL_PLANE}}');
    expect(compose).toContain("WEB_URL: '${WEB_URL:-${SERVICE_URL_PLANE}}'");
    expect(compose).toContain(
      "CORS_ALLOWED_ORIGINS: '${CORS_ALLOWED_ORIGINS:-${SERVICE_URL_PLANE}}'",
    );
    expect(compose).not.toContain('CORS_ALLOWED_ORIGINS:-http://localhost');
    expect(compose).not.toContain("APP_DOMAIN: '${SERVICE_URL_PLANE}'");
    expect(compose).not.toContain('APP_DOMAIN=${SERVICE_URL_PLANE}');
    expect(compose).not.toContain("WEB_URL: '${SERVICE_URL_PLANE}'");
  });

  it('lets Vikunja write its files dir and override its public URL', () => {
    const doc = parse(getTemplate('vikunja')!.compose) as {
      services?: {
        vikunja?: {
          environment?: string[];
          volumes?: string[];
          depends_on?: { init?: { condition?: string } };
        };
        init?: { volumes?: string[]; command?: string[] };
      };
    };
    const files = 'vikunja-files:/app/vikunja/files';
    expect(doc.services?.vikunja?.volumes).toContain(files);
    expect(doc.services?.init?.volumes).toContain(files);
    expect(doc.services?.vikunja?.volumes ?? []).not.toContain('vikunja-data:/app/vikunja/');
    expect(doc.services?.vikunja?.depends_on?.init?.condition).toBe(
      'service_completed_successfully',
    );
    expect(doc.services?.init?.command?.join(' ')).toContain(
      'chown -R 1000 /db /app/vikunja/files',
    );
    const env = doc.services?.vikunja?.environment ?? [];
    expect(env).toContain(
      'VIKUNJA_SERVICE_PUBLICURL=${VIKUNJA_SERVICE_PUBLICURL:-${SERVICE_URL_VIKUNJA}}',
    );
    expect(env).toContain('VIKUNJA_SERVICE_SECRET=$SERVICE_PASSWORD_64_SECRET');
    expect(env.join('\n')).not.toContain('VIKUNJA_SERVICE_JWTSECRET');
  });

  it('lets PostgreSQL Vikunja write its files dir and override its public URL', () => {
    const doc = parse(getTemplate('vikunja-with-postgresql')!.compose) as {
      services?: {
        vikunja?: {
          environment?: string[];
          volumes?: string[];
          depends_on?: {
            init?: { condition?: string };
            postgresql?: { condition?: string };
          };
        };
        init?: { volumes?: string[]; command?: string[] };
        postgresql?: { volumes?: string[] };
      };
    };
    const files = 'vikunja-files:/app/vikunja/files';
    expect(doc.services?.vikunja?.volumes).toContain(files);
    expect(doc.services?.init?.volumes).toContain(files);
    expect(doc.services?.vikunja?.volumes ?? []).not.toContain('vikunja-data:/app/vikunja/');
    expect(doc.services?.vikunja?.depends_on?.init?.condition).toBe(
      'service_completed_successfully',
    );
    expect(doc.services?.vikunja?.depends_on?.postgresql?.condition).toBe('service_healthy');
    const chown = doc.services?.init?.command?.join(' ') ?? '';
    expect(chown).toContain('chown -R 1000 /app/vikunja/files');
    expect(chown).not.toContain('/db');
    const env = doc.services?.vikunja?.environment ?? [];
    expect(env).toContain(
      'VIKUNJA_SERVICE_PUBLICURL=${VIKUNJA_SERVICE_PUBLICURL:-${SERVICE_URL_VIKUNJA}}',
    );
    expect(env).toContain('VIKUNJA_SERVICE_SECRET=$SERVICE_PASSWORD_64_SECRET');
    expect(env.join('\n')).not.toContain('VIKUNJA_SERVICE_JWTSECRET');
    expect(doc.services?.postgresql?.volumes).toContain(
      'vikunja-postgresql-data:/var/lib/postgresql/data',
    );
  });

  it('lets Yamtrack override its public URLs and uses stack-specific Redis', () => {
    const urls = 'URLS=${URLS:-${SERVICE_URL_YAMTRACK}}';
    const redisUrl = 'REDIS_URL=redis://yamtrack-redis:6379';
    for (const slug of ['yamtrack', 'yamtrack-with-postgresql']) {
      const doc = parse(getTemplate(slug)!.compose) as {
        services?: Record<
          string,
          { environment?: string[]; depends_on?: Record<string, { condition?: string }> }
        >;
      };
      const env = doc.services?.yamtrack?.environment ?? [];
      expect(env, slug).toContain(urls);
      expect(env.join('\n'), slug).not.toContain('URLS=${SERVICE_URL_YAMTRACK}');
      expect(env, slug).toContain(redisUrl);
      expect(doc.services?.['yamtrack-redis'], slug).toBeTruthy();
      expect(doc.services?.redis, slug).toBeUndefined();
      expect(doc.services?.yamtrack?.depends_on?.['yamtrack-redis']?.condition, slug).toBe(
        'service_healthy',
      );
    }

    const pg = parse(getTemplate('yamtrack-with-postgresql')!.compose) as {
      services?: Record<
        string,
        {
          environment?: string[];
          depends_on?: Record<string, { condition?: string }>;
        }
      >;
    };
    expect(pg.services?.yamtrack?.environment).toContain('DB_HOST=yamtrack-postgres');
    expect(pg.services?.yamtrack?.depends_on?.['yamtrack-postgres']?.condition).toBe(
      'service_healthy',
    );
    expect(pg.services?.['yamtrack-postgres']).toBeTruthy();
    expect(pg.services).not.toHaveProperty('postgres');
  });

  it('does not use Compose ${VAR:?} required interpolation', () => {
    for (const t of templates) {
      const detail = getTemplate(t.slug)!;
      expect(detail.compose, t.slug).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*\s*:\?/);
    }
  });

  // Compose reads `$` as the start of an interpolation: `$VAR`, `${VAR}`, or
  // `$$` for a literal dollar. Anything else — `$(cmd)`, `$2`, `$?` — is an
  // invalid interpolation that stricter Compose builds reject outright, taking
  // the whole one-click deploy with them. Shell snippets therefore have to
  // double every dollar they want the container's shell to see. Scanning the
  // whole file rather than just healthchecks: offenders have turned up in
  // `command` and `entrypoint` too.
  it('escapes every shell $ Compose would read as an interpolation', () => {
    const offenders: string[] = [];
    for (const t of templates) {
      const compose = getTemplate(t.slug)!.compose;
      for (let i = 0; i < compose.length; i++) {
        if (compose[i] !== '$') continue;
        const next = compose[i + 1];
        if (next === '$') {
          i++;
          continue;
        }
        if (next === '{' || (next && /[A-Za-z_]/.test(next))) continue;
        offenders.push(`${t.slug}: …${compose.slice(Math.max(0, i - 24), i + 24)}…`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
