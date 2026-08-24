import { describe, expect, it } from 'vitest';
import { ensureAgentCredentials } from '@/services/internal/server/agent';
import { prisma } from '@/lib/prisma';
import {
  createPrivateKeyFor,
  createProjectFor,
  createServerFor,
  createServiceFor,
  createUser,
  createWorkspaceFor,
  loginAs,
} from '@/test/integration/fixtures';
import { http } from '@/test/integration/http';

const payload = (serverId: string) => ({
  schema_version: 1,
  server_id: serverId,
  agent_version: '1.2.3',
  sent_at: new Date('2026-01-01T00:00:00Z').toISOString(),
  host: { cpu_percent: 10, memory_percent: 20, disk_percent_root: 30, uptime_seconds: 100 },
  containers: [{ name: 'web', state: 'running', health: 'healthy', image: 'nginx:latest' }],
});

async function setup() {
  const owner = await createUser();
  const workspace = await createWorkspaceFor(owner);
  const project = await createProjectFor(workspace.id);
  const key = await createPrivateKeyFor(workspace.id);
  const server = await createServerFor(workspace.id, key.id);
  const service = await createServiceFor(project.id, {
    serverId: server.id,
    destinationId: server.destinations[0].id,
  });
  return { owner, server, service };
}

describe('agent and webhook APIs', () => {
  it('accepts a valid agent bearer and persists metrics', async () => {
    const { server } = await setup();
    const credentials = await ensureAgentCredentials(server.id);
    const result = await http.post('/api/v1/agents/push', {
      headers: { Authorization: `Bearer ${credentials.token}` },
      body: payload(server.id),
    });

    expect(result.status).toBe(200);
    expect(await prisma.serverSetting.findUnique({ where: { serverId: server.id } })).toMatchObject({
      agentVersion: '1.2.3',
      isReachable: true,
    });
  });

  it('rejects missing and invalid agent credentials and malformed payloads', async () => {
    const { server } = await setup();
    await ensureAgentCredentials(server.id);
    expect((await http.post('/api/v1/agents/push', { body: payload(server.id) })).status).toBe(401);
    expect(
      (
        await http.post('/api/v1/agents/push', {
          headers: { Authorization: 'Bearer wrong' },
          body: payload(server.id),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await http.post('/api/v1/agents/push', {
          headers: { Authorization: 'Bearer wrong' },
          body: {},
        })
      ).status,
    ).toBe(422);
  });

  it('deploys through a generic service webhook token', async () => {
    const { owner, service } = await setup();
    await loginAs(owner);
    const created = await http.post(`/api/services/${service.id}/webhooks`, {
      body: { provider: 'generic' },
    });
    const token = created.body.data.token as string;

    const result = await http.post(`/api/webhooks/${token}`, {
      body: {
        ref: 'refs/heads/main',
        after: 'abc123',
        head_commit: { message: 'Ship it' },
      },
    });
    expect(result.status).toBe(200);
    expect(await prisma.deployment.count({ where: { serviceId: service.id } })).toBe(1);
  });

  it('ignores a webhook push while the service is suspended', async () => {
    const { owner, service } = await setup();
    await loginAs(owner);
    const created = await http.post(`/api/services/${service.id}/webhooks`, {
      body: { provider: 'generic' },
    });
    const token = created.body.data.token as string;

    await http.post(`/api/services/${service.id}/control`, { body: { action: 'suspend' } });

    const result = await http.post(`/api/webhooks/${token}`, {
      body: {
        ref: 'refs/heads/main',
        after: 'abc123',
        head_commit: { message: 'Ship it' },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ triggered: false, reason: 'service suspended' });
    expect(await prisma.deployment.count({ where: { serviceId: service.id } })).toBe(0);
  });

  it('rejects GitHub App events with an invalid signature', async () => {
    const result = await http.post('/api/webhooks/source/github/events', {
      body: { ref: 'refs/heads/main' },
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-hook-installation-target-id': '1',
      },
    });
    expect(result.status).toBeGreaterThanOrEqual(400);
  });
});
