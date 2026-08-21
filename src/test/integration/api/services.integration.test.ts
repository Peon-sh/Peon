import { describe, expect, it } from 'vitest';
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

async function setupService(kind: 'GIT_APP' | 'DATABASE' = 'GIT_APP') {
  const owner = await createUser();
  const workspace = await createWorkspaceFor(owner);
  const project = await createProjectFor(workspace.id);
  const key = await createPrivateKeyFor(workspace.id);
  const server = await createServerFor(workspace.id, key.id);
  const service = await createServiceFor(project.id, {
    kind,
    serverId: server.id,
    destinationId: server.destinations[0].id,
  });
  await loginAs(owner);
  return { owner, workspace, project, server, service };
}

describe('service API', () => {
  it('reads and updates a service and validates input', async () => {
    const { service } = await setupService();
    const path = `/api/services/${service.id}`;

    expect((await http.get(path)).status).toBe(200);
    expect((await http.patch(path, { body: { name: '' } })).status).toBe(422);
    expect((await http.patch(path, { body: { name: 'api' } })).status).toBe(200);
  });

  it('manages environment variables and volumes', async () => {
    const { service } = await setupService();
    const path = `/api/services/${service.id}`;

    expect((await http.get(`${path}/env`)).status).toBe(200);
    const env = await http.post(`${path}/env`, {
      body: { key: 'DATABASE_URL', value: 'postgres://db' },
    });
    expect(env.status).toBe(201);
    expect((await http.put(`${path}/env/bulk`, { body: { raw: 'A=1\nB=2' } })).status).toBe(200);
    expect((await http.delete(`${path}/env/${env.body.data.id as string}`)).status).toBe(200);

    expect((await http.get(`${path}/volumes`)).status).toBe(200);
    const volume = await http.post(`${path}/volumes`, {
      body: { name: 'data', mountPath: '/data', isBindMount: false },
    });
    expect(volume.status).toBe(201);
    expect((await http.delete(`${path}/volumes/${volume.body.data.id as string}`)).status).toBe(200);
  });

  it('deploys, controls, rolls back, lists, and cancels deployments', async () => {
    const { owner, service } = await setupService();
    const path = `/api/services/${service.id}`;

    const deployed = await http.post(`${path}/deploy`, { body: { force: true } });
    expect(deployed.status).toBe(201);
    expect((await http.post(`${path}/control`, { body: { action: 'restart' } })).status).toBe(200);
    expect((await http.get(`${path}/deployments`)).status).toBe(200);

    const deploymentId = deployed.body.data.id as string;
    expect((await http.post(`/api/deployments/${deploymentId}/cancel`)).status).toBe(200);
    const completed = await prisma.deployment.create({
      data: {
        serviceId: service.id,
        status: 'FINISHED',
        triggeredBy: owner.id,
        commitSha: 'abc123def456',
        commitMessage: 'ship it',
      },
    });
    expect((await http.post(`${path}/rollback`, { body: { deploymentId: completed.id } })).status).toBe(201);
  });

  it('suspends a service, blocks deploys while suspended, and resumes', async () => {
    const { service } = await setupService();
    const path = `/api/services/${service.id}`;

    const suspended = await http.post(`${path}/control`, { body: { action: 'suspend' } });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data).toMatchObject({ action: 'suspend', status: 'SUSPENDED' });

    // Desired state is persisted synchronously, before the worker runs.
    const row = await prisma.service.findUnique({ where: { id: service.id } });
    expect(row?.suspendedAt).not.toBeNull();
    expect(row?.status).toBe('SUSPENDED');
    expect((await http.get(path)).body.data.status).toBe('SUSPENDED');

    // Nothing may bring it back up except an explicit resume.
    const before = await prisma.deployment.count({ where: { serviceId: service.id } });
    expect((await http.post(`${path}/deploy`, { body: {} })).status).toBe(409);
    expect((await http.post(`${path}/control`, { body: { action: 'start' } })).status).toBe(409);
    expect((await http.post(`${path}/control`, { body: { action: 'restart' } })).status).toBe(409);
    expect(await prisma.deployment.count({ where: { serviceId: service.id } })).toBe(before);

    // Suspending twice is a no-op rather than a re-stamp.
    const suspendedAt = row!.suspendedAt;
    const again = await http.post(`${path}/control`, { body: { action: 'suspend' } });
    expect(again.status).toBe(200);
    expect(again.body.data.queued).toBe(false);
    expect((await prisma.service.findUnique({ where: { id: service.id } }))?.suspendedAt).toEqual(
      suspendedAt,
    );

    const audit = await prisma.workspaceAuditLog.findFirst({
      where: { resourceId: service.id, action: 'service.suspended' },
    });
    expect(audit).not.toBeNull();

    const resumed = await http.post(`${path}/control`, { body: { action: 'resume' } });
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.status).toBe('STARTING');
    expect((await prisma.service.findUnique({ where: { id: service.id } }))?.suspendedAt).toBeNull();

    // Resume only applies to a suspended service, and deploys work again.
    expect((await http.post(`${path}/control`, { body: { action: 'resume' } })).status).toBe(409);
    expect((await http.post(`${path}/deploy`, { body: {} })).status).toBe(201);
  });

  it('rejects an unknown control action', async () => {
    const { service } = await setupService();
    const res = await http.post(`/api/services/${service.id}/control`, {
      body: { action: 'pause' },
    });
    expect(res.status).toBe(422);
  });

  it('manages webhooks and scheduled tasks', async () => {
    const { service } = await setupService();
    const path = `/api/services/${service.id}`;

    expect((await http.get(`${path}/webhooks`)).status).toBe(200);
    const webhook = await http.post(`${path}/webhooks`, { body: { provider: 'generic' } });
    expect(webhook.status).toBe(201);
    expect((await http.delete(`${path}/webhooks/${webhook.body.data.id as string}`)).status).toBe(200);

    expect((await http.get(`${path}/tasks`)).status).toBe(200);
    const task = await http.post(`${path}/tasks`, {
      body: { name: 'cleanup', command: 'echo ok', frequency: '0 * * * *' },
    });
    expect(task.status).toBe(201);
    const taskPath = `${path}/tasks/${task.body.data.id as string}`;
    expect(
      (
        await http.patch(taskPath, {
          body: { name: 'cleanup-2', command: 'echo ok', frequency: '0 * * * *' },
        })
      ).status,
    ).toBe(200);
    expect((await http.post(`${taskPath}/run`)).status).toBe(201);
    expect((await http.get(`${taskPath}/executions`)).status).toBe(200);
    expect((await http.delete(taskPath)).status).toBe(200);
  });

  it('manages database backups and exercises service runtime endpoints', async () => {
    const { service } = await setupService('DATABASE');
    const path = `/api/services/${service.id}`;

    expect((await http.get(`${path}/backups`)).status).toBe(200);
    const backup = await http.post(`${path}/backups`, {
      body: { frequency: '0 0 * * *', enabled: true, saveS3: false },
    });
    expect(backup.status).toBe(201);
    expect(backup.body.data.dumpAll).toBe(true);
    const backupPath = `${path}/backups/${backup.body.data.id as string}`;

    // Enable S3, then patch only dumpAll — Zod defaults must not reset saveS3.
    expect(
      (
        await http.patch(backupPath, {
          body: { saveS3: true },
        })
      ).status,
    ).toBe(200);
    const dumpOnly = await http.patch(backupPath, {
      body: { dumpAll: false },
    });
    expect(dumpOnly.status).toBe(200);
    expect(dumpOnly.body.data.dumpAll).toBe(false);
    expect(dumpOnly.body.data.saveS3).toBe(true);

    expect(
      (
        await http.patch(backupPath, {
          body: { frequency: '0 1 * * *', enabled: true, saveS3: false, dumpAll: false },
        })
      ).status,
    ).toBe(200);
    expect((await http.post(`${backupPath}/run`)).status).toBe(200);
    const executions = await http.get(`${backupPath}/executions`);
    expect(executions.status).toBe(200);
    expect(executions.body.data.items).toBeDefined();
    expect(executions.body.data.nextCursor).toBeNull();

    await prisma.scheduledBackupExecution.create({
      data: {
        backupId: backup.body.data.id as string,
        status: 'SUCCESS',
        filename: 'backup.sql',
        dumpAll: false,
        finishedAt: new Date(),
      },
    });
    const restore = await http.post(`${path}/backups/restore`, {
      body: { filename: 'backup.sql' },
    });
    expect(restore.status).toBe(200);
    expect(restore.body.data.queued).toBe(true);

    expect(
      (
        await http.get(`${path}/backups/download`, {
          searchParams: { filename: 'missing.sql' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await http.get(`${path}/backups/download`, {
          searchParams: { filename: 'backup.sql' },
        })
      ).status,
    ).toBe(200);
    expect((await http.delete(backupPath)).status).toBe(200);

    expect((await http.get(`${path}/previews`)).status).toBe(200);
    expect((await http.get(`${path}/logs`)).status).toBe(200);
    expect((await http.post(`${path}/exec`, { body: { command: 'echo ok' } })).status).toBe(200);
    expect((await http.post(`${path}/exec/warm`)).status).toBe(200);
    expect((await http.post(`${path}/terminal`, { body: {} })).status).toBe(200);
  });

  it('reads and updates database config, imports preview env, deletes a preview, and removes the service', async () => {
    const { service } = await setupService('DATABASE');
    const path = `/api/services/${service.id}`;

    expect((await http.get(`${path}/config`)).status).toBe(200);
    expect(
      (
        await http.patch(`${path}/config`, {
          body: { databaseImage: 'postgres:16-alpine', dbUsername: 'peon' },
        })
      ).status,
    ).toBe(200);

    await http.post(`${path}/env`, {
      body: { key: 'APP_ENV', value: 'production' },
    });
    expect((await http.post(`${path}/env/import-preview`)).status).toBe(200);

    const preview = await prisma.servicePreview.create({
      data: {
        serviceId: service.id,
        pullRequestId: 42,
        headBranch: 'feature/x',
        commitSha: 'abc123',
      },
    });
    expect((await http.delete(`${path}/previews/${preview.id}`)).status).toBe(200);
    expect(await prisma.servicePreview.findUnique({ where: { id: preview.id } })).toBeNull();

    expect((await http.delete(path)).status).toBe(200);
    expect(await prisma.service.findUnique({ where: { id: service.id } })).toBeNull();
  });

  it('reads a deployment and serves a stubbed preview image', async () => {
    const { owner, service } = await setupService();
    const deployment = await prisma.deployment.create({
      data: {
        serviceId: service.id,
        status: 'FINISHED',
        triggeredBy: owner.id,
        commitSha: 'deadbeef',
        commitMessage: 'ship',
        previewImagePath: `deployments/${service.uuid}/${crypto.randomUUID()}/preview.png`,
      },
    });

    expect((await http.get(`/api/deployments/${deployment.id}`)).status).toBe(200);
    expect((await http.get(`/api/deployments/${deployment.id}/preview`)).status).toBe(200);
    expect((await http.get(`/api/deployments/${crypto.randomUUID()}/preview`)).status).toBe(404);
  });
});
