import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceMember } from '@/lib/auth/access';
import { AppError } from '@/lib/errors';
import { listLlmModelsQuerySchema } from '@/schemas/llm.schema';
import { LlmSettingsService } from '@/services/internal/chat/llm-settings';

export const GET = route(async (request: NextRequest) => {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError('workspaceId is required', 400);
  }
  await requireWorkspaceMember(workspaceId);
  const query = listLlmModelsQuerySchema.parse({
    provider: request.nextUrl.searchParams.get('provider') ?? undefined,
  });
  return ok(await LlmSettingsService.listSupportedModels(query.provider));
});
