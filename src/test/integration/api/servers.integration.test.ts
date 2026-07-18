import { describe, expect, it } from 'vitest';
import {
  addWorkspaceMember,
  createPrivateKeyFor,
  createServerFor,
  createUser,
  createWorkspaceFor,
  loginAs,
} from '@/test/integration/fixtures';
import { http } from '@/test/integration/http';

describe('server infrastructure API', () => {
  it('creates, lists, reads, downloads, and deletes private keys', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await loginAs(owner);
    const basePath = `/api/workspaces/${workspace.id}/private-keys`;

    expect((await http.get(basePath)).status).toBe(200);
    expect((await http.post(basePath, { body: { name: '' } })).status).toBe(422);
    const created = await http.post(basePath, { body: { name: 'generated', generate: true } });
    expect(created.status).toBe(201);

    const keyId = created.body.data.id as string;
    expect((await http.get(`/api/private-keys/${keyId}`)).status).toBe(200);
    const download = await http.get(`/api/private-keys/${keyId}/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect((await http.delete(`/api/private-keys/${keyId}`)).status).toBe(200);
  });

  it('creates, updates, exercises, and deletes servers and destinations', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    const key = await createPrivateKeyFor(workspace.id);
    await loginAs(owner);
    const serversPath = `/api/workspaces/${workspace.id}/servers`;

    expect((await http.post(serversPath, { body: { name: '' } })).status).toBe(422);
    const created = await http.post(serversPath, {
      body: { name: 'edge', ip: '10.0.0.8', port: 22, user: 'root', privateKeyId: key.id },
    });
    expect(created.status).toBe(201);
    const serverId = created.body.data.id as string;
    const serverPath = `/api/servers/${serverId}`;

    expect((await http.get(serversPath)).status).toBe(200);
    expect((await http.get(serverPath)).status).toBe(200);
    expect((await http.patch(serverPath, { body: { name: 'edge-2' } })).status).toBe(200);

    const destination = await http.post(`${serverPath}/destinations`, {
      body: { name: 'apps', network: 'apps' },
    });
    expect(destination.status).toBe(201);
    expect((await http.get(`${serverPath}/destinations`)).status).toBe(200);

    expect((await http.post(`${serverPath}/exec`, { body: { command: 'uptime' } })).status).toBe(200);
    expect((await http.post(`${serverPath}/exec/warm`)).status).toBe(200);
    expect((await http.get(`${serverPath}/logs`)).status).toBe(200);
    expect((await http.post(`${serverPath}/terminal`, { body: { cols: 80, rows: 24 } })).status).toBe(200);
    expect((await http.post(`${serverPath}/validate`)).status).toBe(200);
    expect((await http.post(`${serverPath}/cleanup`)).status).toBe(200);
    expect((await http.post(`${serverPath}/proxy`, { body: { action: 'restart' } })).status).toBe(200);

    const destinationId = destination.body.data.id as string;
    expect((await http.delete(`${serverPath}/destinations/${destinationId}`)).status).toBe(200);
    expect(
      (
        await http.delete(serverPath, {
          body: { confirmName: 'edge-2', deleteResources: false },
        })
      ).status,
    ).toBe(200);
  });

  it('forbids MEMBER infrastructure operations and cross-workspace access', async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id);
    const key = await createPrivateKeyFor(workspace.id);
    const server = await createServerFor(workspace.id, key.id);

    await loginAs(member);
    expect((await http.post(`/api/servers/${server.id}/validate`)).status).toBe(403);
    await loginAs(outsider);
    expect((await http.get(`/api/servers/${server.id}`)).status).toBe(403);
  });
});
