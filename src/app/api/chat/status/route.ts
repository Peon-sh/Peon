import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { AppError } from '@/lib/errors';
import { LlmSettingsService } from '@/services/internal/chat/llm-settings';

export const GET = route(async (request: NextRequest) => {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError('workspaceId is required', 400);
  }
  await requireWorkspaceMember(workspaceId);
  return ok(await LlmSettingsService.getChatStatus(workspaceId));
});
