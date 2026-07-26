import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureAdapter } from '../adapter';

type Envelope = { success: boolean; data?: unknown; message?: string };

async function get(url: string): Promise<Envelope> {
  const res = await fixtureAdapter({ url, method: 'get' } as never);
  return res.data as Envelope;
}

describe('fixture adapter', () => {
  describe('reads', () => {
    it('answers /auth/me with a user and workspaces', async () => {
      const body = await get('/auth/me');
      expect(body.success).toBe(true);
      const data = body.data as { user: { email: string }; workspaces: unknown[] };
      expect(data.user.email).toBe('dev@peon.local');
      expect(data.workspaces.length).toBeGreaterThan(0);
    });

    it('lists projects for a workspace', async () => {
      const body = await get('/workspaces/ws_fixture/projects');
      expect(Array.isArray(body.data)).toBe(true);
      expect((body.data as unknown[]).length).toBeGreaterThan(0);
    });

    it('lists services scoped to a project', async () => {
      const body = await get('/projects/prj_web/services');
      const services = body.data as Array<{ projectId: string }>;
      expect(services.length).toBeGreaterThan(0);
      expect(services.every((s) => s.projectId === 'prj_web')).toBe(true);
    });

    it('returns an empty list for the empty-state project', async () => {
      const body = await get('/projects/prj_empty/services');
      expect(body.data).toEqual([]);
    });

    it('includes both LOCAL and REMOTE servers', async () => {
      const body = await get('/workspaces/ws_fixture/servers');
      const servers = body.data as Array<{ executionMode: string }>;
      expect(servers.some((s) => s.executionMode === 'LOCAL')).toBe(true);
      expect(servers.some((s) => s.executionMode === 'REMOTE')).toBe(true);
    });

    it('scopes deployments to a service', async () => {
      const body = await get('/services/svc_web/deployments');
      const deployments = body.data as Array<{ serviceId: string }>;
      expect(deployments.every((d) => d.serviceId === 'svc_web')).toBe(true);
    });

    it('returns log lines', async () => {
      const body = await get('/services/svc_web/logs');
      const data = body.data as { lines: string[] };
      expect(data.lines.length).toBeGreaterThan(0);
    });

    it('resolves a single service by id', async () => {
      const body = await get('/services/svc_db');
      expect((body.data as { name: string }).name).toBe('postgres');
    });

    it('strips the /api prefix and query strings before matching', async () => {
      const body = await get('/api/workspaces/ws_fixture/servers?foo=bar');
      expect(Array.isArray(body.data)).toBe(true);
      expect((body.data as unknown[]).length).toBe(3);
    });

    it('returns an empty array for unknown routes rather than 404', async () => {
      // An unfamiliar screen should render its empty state, not an error.
      const body = await get('/some/route/we/never/taught/it');
      expect(body).toEqual({ success: true, data: [] });
    });
  });

  describe('writes', () => {
    it('acknowledges a POST and echoes the body', async () => {
      const res = await fixtureAdapter({
        url: '/projects',
        method: 'post',
        data: JSON.stringify({ name: 'New Project' }),
      } as never);
      const body = res.data as Envelope;
      expect(body.success).toBe(true);
      expect((body.data as { name: string }).name).toBe('New Project');
      expect((body.data as { id: string }).id).toMatch(/^fixture_/);
    });

    it('tolerates a non-JSON body', async () => {
      const res = await fixtureAdapter({
        url: '/projects',
        method: 'post',
        data: 'not-json',
      } as never);
      expect((res.data as Envelope).success).toBe(true);
    });

    it('acknowledges DELETE', async () => {
      const res = await fixtureAdapter({ url: '/projects/prj_web', method: 'delete' } as never);
      expect((res.data as Envelope).success).toBe(true);
    });
  });
});

/**
 * Architectural guard. The whole point of the adapter approach is that fixture
 * awareness lives in exactly one place; if `UI_MODE` starts appearing inside
 * components, the design has been defeated.
 */
describe('fixture mode does not leak into components', () => {
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  it('has no fixture-mode conditionals inside src/components', () => {
    const offenders = walk(join(process.cwd(), 'src/components'))
      // The badge is the one component that legitimately knows, and it only
      // decides whether to render itself.
      .filter((f) => !f.endsWith('ui-mode-badge.tsx'))
      .filter((f) => /isUiFixtureMode|UI_MODE|PEON_UI_MODE|dev-fixtures/.test(readFileSync(f, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('has no fixture-mode conditionals inside src/services/api', () => {
    const offenders = walk(join(process.cwd(), 'src/services/api')).filter((f) =>
      /isUiFixtureMode|UI_MODE|PEON_UI_MODE|dev-fixtures/.test(readFileSync(f, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
