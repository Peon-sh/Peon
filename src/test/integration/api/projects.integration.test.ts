import { describe, expect, it } from 'vitest';
import {
  addWorkspaceMember,
  createPrivateKeyFor,
  createProjectFor,
  createServerFor,
  createUser,
  createWorkspaceFor,
  loginAs,
} from '@/test/integration/fixtures';
import { http } from '@/test/integration/http';
import { prisma } from '@/lib/prisma';

describe('project API', () => {
  it('creates, lists, reads, updates, and deletes a project', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await loginAs(owner);

    expect((await http.get(`/api/workspaces/${workspace.id}/projects`)).status).toBe(200);
    expect((await http.post(`/api/workspaces/${workspace.id}/projects`, { body: { name: '' } })).status).toBe(422);
    const created = await http.post(`/api/workspaces/${workspace.id}/projects`, {
      body: { name: 'Production' },
    });
    expect(created.status).toBe(201);
    const projectId = created.body.data.id as string;
    expect((await http.get(`/api/projects/${projectId}`)).status).toBe(200);
    expect((await http.patch(`/api/projects/${projectId}`, { body: { name: 'Prod' } })).status).toBe(200);
    expect((await http.delete(`/api/projects/${projectId}`)).status).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: projectId } })).toBeNull();
  });

  it('creates services via API and from a template', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    const project = await createProjectFor(workspace.id);
    const key = await createPrivateKeyFor(workspace.id);
    const server = await createServerFor(workspace.id, key.id);
    await loginAs(owner);

    const servicesPath = `/api/projects/${project.id}/services`;
    expect((await http.get(servicesPath)).status).toBe(200);
    expect(
      (
        await http.post(servicesPath, {
          body: { kind: 'GIT_APP', name: '' },
        })
      ).status,
    ).toBe(422);

    const created = await http.post(servicesPath, {
      body: {
        kind: 'GIT_APP',
        name: 'api',
        serverId: server.id,
        destinationId: server.destinations[0].id,
        gitRepository: 'https://github.com/acme/api.git',
        gitBranch: 'main',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'api', kind: 'GIT_APP' });

    const fromTemplate = await http.post(`${servicesPath}/from-template`, {
      body: {
        slug: 'actualbudget',
        name: 'Budget',
        serverId: server.id,
        destinationId: server.destinations[0].id,
      },
    });
    expect(fromTemplate.status).toBe(201);
    expect(fromTemplate.body.data).toMatchObject({ kind: 'COMPOSE', templateSlug: 'actualbudget' });
  });

  it('manages project members', async () => {
    const owner = await createUser();
    const user = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, user.id);
    const project = await createProjectFor(workspace.id);
    await loginAs(owner);

    expect((await http.get(`/api/projects/${project.id}/members`)).status).toBe(200);
    expect(
      (
        await http.post(`/api/projects/${project.id}/members`, {
          body: { userId: user.id, role: 'MEMBER' },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await http.patch(`/api/projects/${project.id}/members/${user.id}`, {
          body: { role: 'ADMIN' },
        })
      ).status,
    ).toBe(200);
    expect((await http.delete(`/api/projects/${project.id}/members/${user.id}`)).status).toBe(200);
  });

  it('forbids a workspace member without project membership and outsiders', async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id);
    const project = await createProjectFor(workspace.id);

    await loginAs(member);
    expect((await http.get(`/api/projects/${project.id}`)).status).toBe(403);
    await loginAs(outsider);
    expect((await http.get(`/api/projects/${project.id}`)).status).toBe(403);
  });
});
