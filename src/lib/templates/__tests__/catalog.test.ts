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

  it('does not use Compose ${VAR:?} required interpolation', () => {
    for (const t of templates) {
      const detail = getTemplate(t.slug)!;
      expect(detail.compose, t.slug).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*\s*:\?/);
    }
  });
});
