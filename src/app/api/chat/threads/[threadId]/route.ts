import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { updateChatThreadSchema } from '@/schemas/chat.schema';
import { ChatService } from '@/services/internal/chat/chat';
import { LlmSettingsService } from '@/services/internal/chat/llm-settings';

type Ctx = { params: Promise<{ threadId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { threadId } = await params;
  const thread = await ChatService.getThreadWithMessages(threadId, user.id);
  await requireWorkspaceMember(thread.workspaceId);
  return ok({
    ...thread,
    messages: thread.messages.map((m) => ({
      id: m.id,
      role: m.role.toLowerCase(),
      parts: m.parts,
      status: m.status,
      createdAt: m.createdAt,
    })),
  });
});

export const PATCH = route(async (request: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { threadId } = await params;
  const body = updateChatThreadSchema.parse(await request.json());
  const thread = await ChatService.requireOwnedThread(threadId, user.id);
  await requireWorkspaceMember(thread.workspaceId);

  if (body.title !== undefined) {
    await ChatService.renameThread(threadId, user.id, body.title);
  }
  if (body.modelProvider && body.modelId) {
    const resolved = await LlmSettingsService.resolveModelSelection(thread.workspaceId, {
      provider: body.modelProvider,
      modelId: body.modelId,
    });
    return ok(
      await ChatService.updateThreadModel(
        threadId,
        user.id,
        resolved.provider,
        resolved.modelId,
      ),
    );
  }

  return ok(await ChatService.requireOwnedThread(threadId, user.id));
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { threadId } = await params;
  const thread = await ChatService.requireOwnedThread(threadId, user.id);
  await requireWorkspaceMember(thread.workspaceId);
  return ok(await ChatService.deleteThread(threadId, user.id));
});
