import { describe, expect, it } from 'vitest';
import {
  createProjectFor,
  createServiceFor,
  createUser,
  createWorkspaceFor,
  loginAs,
} from '@/test/integration/fixtures';
import { http } from '@/test/integration/http';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto/encryption';

describe('sources, storage, and workspace settings APIs', () => {
  it('manages GitHub sources and uses mocked repository APIs', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await loginAs(owner);
    const path = `/api/workspaces/${workspace.id}/sources`;

    expect((await http.get(path)).status).toBe(200);
    expect((await http.post(path, { body: { provider: 'github', name: '' } })).status).toBe(422);
    const created = await http.post(path, {
      body: { provider: 'github', name: 'GitHub', installationId: '42', appId: '1' },
    });
    expect(created.status).toBe(201);
    const sourcePath = `/api/sources/${created.body.data.id as string}`;

    expect((await http.get(sourcePath)).status).toBe(200);
    expect((await http.patch(sourcePath, { body: { name: 'GitHub 2' } })).status).toBe(200);
    expect((await http.get(`${sourcePath}/github/repositories`)).status).toBe(200);
    expect(
      (
        await http.get(`${sourcePath}/github/branches`, {
          searchParams: { repo: 'acme/app' },
        })
      ).status,
    ).toBe(200);

    const project = await createProjectFor(workspace.id);
    const linked = await createServiceFor(project.id, { name: 'linked' });
    await prisma.service.update({
      where: { id: linked.id },
      data: { githubAppId: created.body.data.id as string },
    });
    const resources = await http.get(`${sourcePath}/resources`);
    expect(resources.status).toBe(200);
    expect(resources.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: linked.id, name: 'linked' })]),
    );

    await prisma.service.update({ where: { id: linked.id }, data: { githubAppId: null } });
    expect((await http.delete(sourcePath)).status).toBe(200);
  });

  it('starts platform GitHub connect and completes the install callback', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await loginAs(owner);

    const start = await http.post(`/api/workspaces/${workspace.id}/sources/github/connect`);
    expect(start.status).toBe(200);
    const installUrl = start.body.data.installUrl as string;
    expect(installUrl).toContain('github.com');
    const state = new URL(installUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await http.get('/api/sources/github/install/callback', {
      searchParams: {
        state: state!,
        installation_id: `install-${crypto.randomUUID().slice(0, 8)}`,
        setup_action: 'install',
      },
      headers: { accept: 'text/html' },
    });
    expect([302, 303, 307]).toContain(callback.status);
    const location = callback.headers.get('location') ?? '';
    expect(location).toMatch(/\/sources\/.+\?.*github=connected/);
  });

  it('manages and tests S3-compatible storage', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await loginAs(owner);
    const path = `/api/workspaces/${workspace.id}/storages`;

    expect((await http.get(path)).status).toBe(200);
    const created = await http.post(path, {
      body: {
        name: 'backups',
        region: 'us-east-1',
        bucket: 'peon',
        accessKey: 'key',
        secretKey: 'secret',
      },
    });
    expect(created.status).toBe(201);
    const storagePath = `/api/storages/${created.body.data.id as string}`;

    const detail = await http.get(storagePath);
    expect(detail.status).toBe(200);
    expect(detail.body.data.accessKey).toBe('key');
    expect(detail.body.data.secretKey).toBeUndefined();

    expect(
      (
        await http.patch(storagePath, {
          body: { name: 'archive', accessKey: 'key-2' },
        })
      ).status,
    ).toBe(200);
    const stored = await prisma.s3Storage.findUniqueOrThrow({
      where: { id: created.body.data.id as string },
      select: { accessKey: true, secretKey: true },
    });
    expect(decrypt(stored.accessKey)).toBe('key-2');
    expect(decrypt(stored.secretKey)).toBe('secret');

    expect((await http.post(`${storagePath}/test`)).status).toBe(200);
    expect((await http.delete(storagePath)).status).toBe(200);
  });

  it('manages shared variables, tags, and API tokens', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await loginAs(owner);
    const workspacePath = `/api/workspaces/${workspace.id}`;

    const variablesPath = `${workspacePath}/shared-variables`;
    expect((await http.get(variablesPath)).status).toBe(200);
    const variable = await http.post(variablesPath, {
      body: { scope: 'WORKSPACE', key: 'REGION', value: 'us-east-1' },
    });
    expect(variable.status).toBe(201);
    const variablePath = `/api/shared-variables/${variable.body.data.id as string}`;
    expect((await http.patch(variablePath, { body: { value: 'eu-west-1' } })).status).toBe(200);
    expect((await http.delete(variablePath)).status).toBe(200);

    const tagsPath = `${workspacePath}/tags`;
    expect((await http.get(tagsPath)).status).toBe(200);
    const tag = await http.post(tagsPath, { body: { name: 'production' } });
    expect(tag.status).toBe(201);
    expect((await http.delete(`/api/tags/${tag.body.data.id as string}`)).status).toBe(200);

    const tokensPath = `${workspacePath}/tokens`;
    expect((await http.get(tokensPath)).status).toBe(200);
    const token = await http.post(tokensPath, { body: { name: 'automation' } });
    expect(token.status).toBe(201);
    expect((await http.delete(`/api/tokens/${token.body.data.id as string}`)).status).toBe(200);
  });

  it('manages notifications and LLM credentials and lists templates/deployments', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await loginAs(owner);
    const workspacePath = `/api/workspaces/${workspace.id}`;

    const notificationsPath = `${workspacePath}/notifications`;
    expect((await http.get(notificationsPath)).status).toBe(200);
    expect(
      (
        await http.put(notificationsPath, {
          body: {
            channel: 'EMAIL',
            enabled: true,
            config: { to: 'alerts@peon.test' },
            events: {},
          },
        })
      ).status,
    ).toBe(200);
    expect((await http.post(`${notificationsPath}/EMAIL/test`)).status).toBe(200);

    const llmPath = `${workspacePath}/llm/credentials`;
    expect((await http.get(llmPath)).status).toBe(200);
    expect((await http.put(llmPath, { body: { provider: 'openai', apiKey: 'sk-test' } })).status).toBe(200);
    expect((await http.delete(llmPath, { body: { provider: 'openai' } })).status).toBe(200);
    expect((await http.get('/api/templates')).status).toBe(200);
    expect((await http.get(`${workspacePath}/deployments/active`)).status).toBe(200);
  });
});
