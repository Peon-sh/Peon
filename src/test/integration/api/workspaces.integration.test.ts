import { describe, expect, it } from 'vitest';
import { addWorkspaceMember, createUser, createWorkspaceFor, loginAs } from '@/test/integration/fixtures';
import { clearCookies, http } from '@/test/integration/http';
import { prisma } from '@/lib/prisma';

describe('workspace API', () => {
  it('lists, creates, reads, updates, and deletes workspaces', async () => {
    const owner = await createUser();
    await loginAs(owner);
    expect((await http.get('/api/workspaces')).status).toBe(200);

    const created = await http.post('/api/workspaces', { body: { name: 'Acme' } });
    expect(created.status).toBe(201);
    const workspaceId = created.body.data.id as string;

    expect((await http.get(`/api/workspaces/${workspaceId}`)).status).toBe(200);
    expect((await http.patch(`/api/workspaces/${workspaceId}`, { body: { name: 'Acme 2' } })).status).toBe(200);
    expect((await http.delete(`/api/workspaces/${workspaceId}`)).status).toBe(200);
    expect(await prisma.workspace.findUnique({ where: { id: workspaceId } })).toBeNull();
  });

  it('validates workspace creation and requires authentication', async () => {
    clearCookies();
    expect((await http.get('/api/workspaces')).status).toBe(401);
    const user = await createUser();
    await loginAs(user);
    expect((await http.post('/api/workspaces', { body: { name: '' } })).status).toBe(422);
  });

  it('invites, lists, changes roles, removes members, and revokes invitations', async () => {
    const owner = await createUser();
    const member = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id);
    await loginAs(owner);

    expect((await http.get(`/api/workspaces/${workspace.id}/members`)).status).toBe(200);
    expect(
      (
        await http.patch(`/api/workspaces/${workspace.id}/members/${member.id}`, {
          body: { role: 'ADMIN' },
        })
      ).status,
    ).toBe(200);

    const invitee = await createUser();
    const invited = await http.post(`/api/workspaces/${workspace.id}/members`, {
      body: { email: invitee.email, role: 'MEMBER' },
    });
    expect(invited.status).toBe(201);
    const invitation = await prisma.workspaceInvitation.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    expect((await http.delete(`/api/workspaces/${workspace.id}/invitations/${invitation.id}`)).status).toBe(200);
    expect((await http.delete(`/api/workspaces/${workspace.id}/members/${member.id}`)).status).toBe(200);
  });

  it('forbids members from management and blocks cross-workspace access', async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const workspace = await createWorkspaceFor(owner);
    await addWorkspaceMember(workspace.id, member.id);

    await loginAs(member);
    expect(
      (
        await http.post(`/api/workspaces/${workspace.id}/members`, {
          body: { email: outsider.email },
        })
      ).status,
    ).toBe(403);
    await loginAs(outsider);
    expect((await http.get(`/api/workspaces/${workspace.id}`)).status).toBe(403);
  });
});
