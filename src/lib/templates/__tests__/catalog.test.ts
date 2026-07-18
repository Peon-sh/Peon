import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
