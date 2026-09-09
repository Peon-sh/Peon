import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    service: { create: vi.fn() },
    environmentVariable: { createMany: vi.fn() },
  },
}));

vi.mock('@/lib/auth/workspace-resources', () => ({
  workspaceIdForProject: vi.fn().mockResolvedValue('ws1'),
  workspaceIdForService: vi.fn().mockResolvedValue('ws1'),
  assertBindingsInWorkspace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/crypto/encryption', () => ({
  encrypt: (v: string) => v,
  decryptNullable: (v: string) => v,
}));

vi.mock('@/services/internal/audit/audit', () => ({
  AuditService: { record: vi.fn() },
}));

vi.mock('@/services/internal/audit/service-audit', () => ({
  recordServiceAudit: vi.fn(),
}));

vi.mock('@/services/internal/deploy/engine', () => ({
  teardownService: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { createFromTemplate } from '../lifecycle';

const serverFindUnique = vi.mocked(prisma.server.findUnique);
const serviceCreate = vi.mocked(prisma.service.create);
const envCreateMany = vi.mocked(prisma.environmentVariable.createMany);

/** The magic env vars written for the new service, keyed by name. */
function storedEnv(): Record<string, string> {
  const arg = envCreateMany.mock.calls[0]?.[0] as
    | { data: { key: string; value: string }[] }
    | undefined;
  return Object.fromEntries((arg?.data ?? []).map((r) => [r.key, r.value]));
}

// Peon's proxy serves these generated hostnames over https. Telling the app
// `http://` is what breaks logins and signups in apps that put their own URL
// in front of the browser.
describe('createFromTemplate public URL scheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceCreate.mockResolvedValue({ id: 'svc1', name: 'activepieces' } as never);
    envCreateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('advertises https for a service placed on a server', async () => {
    serverFindUnique.mockResolvedValue({ ip: '1.2.3.4', settings: null } as never);

    await createFromTemplate('proj1', { slug: 'activepieces', serverId: 'srv1' });

    const env = storedEnv();
    const urls = Object.entries(env).filter(([k]) => k.startsWith('SERVICE_URL_'));
    expect(urls.length).toBeGreaterThan(0);
    for (const [key, value] of urls) {
      expect(value, key).toMatch(/^https:\/\//);
    }
    expect(env.SERVICE_FQDN_ACTIVEPIECES).toContain('1.2.3.4.sslip.io');
  });

  it('uses the server wildcard domain when one is configured', async () => {
    serverFindUnique.mockResolvedValue({
      ip: '1.2.3.4',
      settings: { wildcardDomain: 'apps.example.com' },
    } as never);

    await createFromTemplate('proj1', { slug: 'activepieces', serverId: 'srv1' });

    expect(storedEnv().SERVICE_URL_ACTIVEPIECES).toBe(
      'https://activepieces-svc1.apps.example.com',
    );
  });

  // No server means no proxy and no certificate, so claiming https would be a
  // lie in the other direction.
  it('leaves the localhost fallback on http when no server is chosen', async () => {
    await createFromTemplate('proj1', { slug: 'activepieces' });

    expect(serverFindUnique).not.toHaveBeenCalled();
    expect(storedEnv().SERVICE_URL_ACTIVEPIECES).toBe(
      'http://activepieces-svc1.localhost',
    );
  });
});
