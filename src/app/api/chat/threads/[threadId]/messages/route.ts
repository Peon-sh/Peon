import type { NextRequest } from 'next/server';
import type { UIMessage } from 'ai';
import { route } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { ChatService } from '@/services/internal/chat/chat';
import { streamChatAgent } from '@/services/internal/chat/agent';

type Ctx = { params: Promise<{ threadId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { threadId } = await params;
  const thread = await ChatService.requireOwnedThread(threadId, user.id);
  await requireWorkspaceMember(thread.workspaceId);

  const body = (await request.json()) as { messages?: UIMessage[] };
  const messages = body.messages ?? [];

  return streamChatAgent({
    threadId,
    user,
    workspaceId: thread.workspaceId,
    messages,
    abortSignal: request.signal,
  });
});
