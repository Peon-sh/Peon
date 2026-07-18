import { describe, expect, it } from 'vitest';
import {
  addWorkspaceMember,
  createProjectFor,
  createUser,
  createWorkspaceFor,
  loginAs,
} from '@/test/integration/fixtures';
import { http } from '@/test/integration/http';
import { prisma } from '@/lib/prisma';

describe('workspace ownership and audit', () => {
  it('rejects inviting or promoting to OWNER', async () => {
    const owner = await createUser();
    const member = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id, 'MEMBER');
    await loginAs(owner);

    expect(
      (
        await http.post(`/api/workspaces/${workspace.id}/members`, {
          body: { email: (await createUser()).email, role: 'OWNER' },
        })
      ).status,
    ).toBe(422);

    expect(
      (
        await http.patch(`/api/workspaces/${workspace.id}/members/${member.id}`, {
          body: { role: 'OWNER' },
        })
      ).status,
    ).toBe(422);
  });

  it('transfers ownership and writes an audit row', async () => {
    const owner = await createUser();
    const member = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id, 'ADMIN');
    await loginAs(owner);

    const transferred = await http.post(`/api/workspaces/${workspace.id}/transfer-ownership`, {
      body: { targetUserId: member.id, formerOwnerDisposition: 'ADMIN' },
    });
    expect(transferred.status).toBe(200);

    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(ws.ownerId).toBe(member.id);
    const roles = await prisma.workspaceMembership.findMany({
      where: { workspaceId: workspace.id },
    });
    expect(roles.find((r) => r.userId === member.id)?.role).toBe('OWNER');
    expect(roles.find((r) => r.userId === owner.id)?.role).toBe('ADMIN');
    expect(roles.filter((r) => r.role === 'OWNER')).toHaveLength(1);

    const audit = await prisma.workspaceAuditLog.findFirst({
      where: { workspaceId: workspace.id, action: 'workspace.ownership.transferred' },
    });
    expect(audit).toBeTruthy();
  });

  it('forbids owners from leaving and allows members to leave', async () => {
    const owner = await createUser();
    const member = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id, 'MEMBER');

    await loginAs(owner);
    expect((await http.post(`/api/workspaces/${workspace.id}/leave`)).status).toBe(400);

    await loginAs(member);
    expect((await http.post(`/api/workspaces/${workspace.id}/leave`)).status).toBe(200);
    expect(
      await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: member.id } },
      }),
    ).toBeNull();
  });

  it('blocks workspace delete while projects exist and exposes preflight', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await createProjectFor(workspace.id, { name: 'Keep Me' });
    await loginAs(owner);

    const preflight = await http.get(`/api/workspaces/${workspace.id}/delete-preflight`);
    expect(preflight.status).toBe(200);
    expect(preflight.body.data.canDelete).toBe(false);
    expect(preflight.body.data.projects).toHaveLength(1);

    expect((await http.delete(`/api/workspaces/${workspace.id}`)).status).toBe(400);
  });

  it('blocks project delete while services exist', async () => {
    const owner = await createUser();
    const workspace = await createWorkspaceFor(owner);
    const project = await createProjectFor(workspace.id);
    await prisma.service.create({
      data: {
        name: 'web',
        kind: 'DOCKER_IMAGE',
        projectId: project.id,
        settings: { create: {} },
      },
    });
    await loginAs(owner);

    const res = await http.delete(`/api/projects/${project.id}`);
    expect(res.status).toBe(400);
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeTruthy();
  });

  it('lists audit logs for OWNER only with filters', async () => {
    const owner = await createUser();
    const member = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id, 'MEMBER');
    await loginAs(owner);

    await http.patch(`/api/workspaces/${workspace.id}`, { body: { name: 'Audited WS' } });

    const asOwner = await http.get(`/api/workspaces/${workspace.id}/audit?action=workspace.updated`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(asOwner.body.data.items[0].action).toBe('workspace.updated');

    await loginAs(member);
    expect((await http.get(`/api/workspaces/${workspace.id}/audit`)).status).toBe(403);
  });
});
