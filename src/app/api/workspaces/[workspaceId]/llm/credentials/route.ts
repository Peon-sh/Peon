import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess, requireWorkspaceMember } from '@/lib/auth/access';
import {
  deleteLlmCredentialSchema,
  upsertLlmCredentialSchema,
} from '@/schemas/llm.schema';
import { LlmSettingsService } from '@/services/internal/chat/llm-settings';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceMember(workspaceId);
  return ok(await LlmSettingsService.listCredentialsStatus(workspaceId));
});

export const PUT = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  const body = upsertLlmCredentialSchema.parse(await request.json());
  return ok(await LlmSettingsService.upsertCredential(workspaceId, body.provider, body.apiKey));
});

export const DELETE = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireInfraAccess(workspaceId);
  const body = deleteLlmCredentialSchema.parse(await request.json());
  return ok(await LlmSettingsService.deleteCredential(workspaceId, body.provider));
});
