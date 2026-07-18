import catalog from './service-templates.json';

/**
 * One-click service template catalog, vendored from an upstream
 * `service-templates-latest.json` (Apache-2.0). Each entry's `compose` (and
 * optional `envs`) payload is base64-encoded.
 */

interface RawTemplate {
  documentation?: string;
  slogan?: string;
  compose: string;
  envs?: string;
  tags?: string[];
  category?: string;
  logo?: string;
  minversion?: string;
  port?: string;
  amd_only?: boolean;
  arm_only?: boolean;
}

export interface TemplateSummary {
  slug: string;
  name: string;
  slogan: string;
  documentation?: string;
  tags: string[];
  category?: string;
  /** Public path to the service logo, e.g. `/svgs/n8n.png`. */
  logo?: string;
  port?: string;
  amdOnly?: boolean;
  armOnly?: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  /** Decoded docker-compose YAML. */
  compose: string;
  /** Decoded `.env` seed lines, when the template ships one. */
  envs?: string;
}

const TEMPLATES = catalog as unknown as Record<string, RawTemplate>;

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function logoPath(logo?: string): string | undefined {
  if (!logo) return undefined;
  return logo.startsWith('/') ? logo : `/${logo}`;
}

function toSummary(slug: string, raw: RawTemplate): TemplateSummary {
  return {
    slug,
    name: titleFromSlug(slug),
    slogan: raw.slogan ?? '',
    documentation: raw.documentation,
    tags: raw.tags ?? [],
    category: raw.category,
    logo: logoPath(raw.logo),
    port: raw.port,
    amdOnly: raw.amd_only,
    armOnly: raw.arm_only,
  };
}

/** List all templates, optionally filtered by a search term and/or category. */
export function listTemplates(opts: { search?: string; category?: string } = {}): TemplateSummary[] {
  const search = opts.search?.toLowerCase().trim();
  const category = opts.category?.toLowerCase().trim();
  const out: TemplateSummary[] = [];
  for (const [slug, raw] of Object.entries(TEMPLATES)) {
    if (category && (raw.category ?? '').toLowerCase() !== category) continue;
    if (search) {
      const haystack = `${slug} ${raw.slogan ?? ''} ${(raw.tags ?? []).join(' ')}`.toLowerCase();
      if (!haystack.includes(search)) continue;
    }
    out.push(toSummary(slug, raw));
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** All distinct categories present in the catalog. */
export function listTemplateCategories(): string[] {
  const set = new Set<string>();
  for (const raw of Object.values(TEMPLATES)) {
    if (raw.category) for (const c of raw.category.split(',')) set.add(c.trim());
  }
  return [...set].sort();
}

/** Fetch a template with its compose (and env seed) decoded. */
export function getTemplate(slug: string): TemplateDetail | null {
  const raw = TEMPLATES[slug];
  if (!raw) return null;
  return {
    ...toSummary(slug, raw),
    compose: Buffer.from(raw.compose, 'base64').toString('utf8'),
    envs: raw.envs ? Buffer.from(raw.envs, 'base64').toString('utf8') : undefined,
  };
}
