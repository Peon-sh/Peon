import type { NextRequest } from 'next/server';
import { created, ok, route } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { createChatThreadSchema, listChatThreadsQuerySchema } from '@/schemas/chat.schema';
import { ChatService } from '@/services/internal/chat/chat';
import { LlmSettingsService } from '@/services/internal/chat/llm-settings';

export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const query = listChatThreadsQuerySchema.parse({
    workspaceId: request.nextUrl.searchParams.get('workspaceId'),
  });
  await requireWorkspaceMember(query.workspaceId);
  return ok(await ChatService.listThreads(query.workspaceId, user.id));
});

export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const body = createChatThreadSchema.parse(await request.json());
  await requireWorkspaceMember(body.workspaceId);
  const resolved = await LlmSettingsService.resolveModelSelection(body.workspaceId, {
    provider: body.modelProvider,
    modelId: body.modelId,
  });
  const thread = await ChatService.createThread({
    workspaceId: body.workspaceId,
    userId: user.id,
    title: body.title,
    modelProvider: resolved.provider,
    modelId: resolved.modelId,
  });
  return created(thread);
});
