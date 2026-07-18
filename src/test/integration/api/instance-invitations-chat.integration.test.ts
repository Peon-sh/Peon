import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { createUser, createWorkspaceFor, ensureInstanceSettings, loginAs } from '@/test/integration/fixtures';
import { http } from '@/test/integration/http';

describe('instance, invitation, and chat APIs', () => {
  it('allows the instance owner to update settings and forbids other users', async () => {
    await ensureInstanceSettings();
    const owner = await createUser({ email: 'owner@peon.test' });
    await loginAs(owner);

    expect((await http.get('/api/instance/settings')).status).toBe(200);
    expect(
      (
        await http.patch('/api/instance/settings', {
          body: { settings: { instanceName: 'Peon Test' } },
        })
      ).status,
    ).toBe(200);

    const user = await createUser();
    await loginAs(user);
    expect((await http.get('/api/instance/settings')).status).toBe(403);
    expect(
      (
        await http.patch('/api/instance/settings', {
          body: { settings: { instanceName: '' } },
        })
      ).status,
    ).toBe(403);
  });

  it('previews and accepts a workspace invitation', async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const workspace = await createWorkspaceFor(owner);
    const token = crypto.randomUUID();
    await prisma.workspaceInvitation.create({
      data: {
        workspaceId: workspace.id,
        invitedById: owner.id,
        email: invitee.email,
        role: 'MEMBER',
        token,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect((await http.get(`/api/invitations/${token}`)).status).toBe(200);
    await loginAs(invitee);
    expect((await http.post(`/api/invitations/${token}/accept`)).status).toBe(200);
    expect(
      await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: invitee.id } },
      }),
    ).not.toBeNull();
  });

  it('reports chat status, lists supported models, and manages threads', async () => {
    const user = await createUser();
    const workspace = await createWorkspaceFor(user);
    await prisma.chatSupportedModel.create({
      data: { provider: 'OPENAI', modelId: 'gpt-test', displayName: 'GPT Test', enabled: true },
    });
    await loginAs(user);

    expect(
      (
        await http.put(`/api/workspaces/${workspace.id}/llm/credentials`, {
          body: { provider: 'openai', apiKey: 'sk-test' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await http.get('/api/chat/status', {
          searchParams: { workspaceId: workspace.id },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await http.get('/api/llm/models', {
          searchParams: { workspaceId: workspace.id },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await http.get('/api/chat/threads', {
          searchParams: { workspaceId: workspace.id },
        })
      ).status,
    ).toBe(200);

    const created = await http.post('/api/chat/threads', {
      body: {
        workspaceId: workspace.id,
        title: 'Deploy app',
        modelProvider: 'openai',
        modelId: 'gpt-test',
      },
    });
    expect(created.status).toBe(201);
    const threadPath = `/api/chat/threads/${created.body.data.id as string}`;
    expect((await http.get(threadPath)).status).toBe(200);
    expect((await http.patch(threadPath, { body: { title: 'Deploy API' } })).status).toBe(200);
    expect((await http.delete(threadPath)).status).toBe(200);
  });

  it('covers streaming message authz and approval validation failures', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const workspace = await createWorkspaceFor(owner);
    const thread = await prisma.chatThread.create({
      data: { workspaceId: workspace.id, userId: owner.id, title: 'Private' },
    });
    await loginAs(outsider);

    expect(
      (
        await http.post(`/api/chat/threads/${thread.id}/messages`, {
          body: { messages: [] },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await http.post('/api/chat/approvals', {
          body: { approvalId: '', approved: true },
        })
      ).status,
    ).toBe(422);
  });
});
