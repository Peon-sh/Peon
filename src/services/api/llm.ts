import { api, unwrap } from '@/lib/http/axios';

export type LlmProviderId = 'openai' | 'anthropic';

export type LlmCredentialStatus = {
  provider: LlmProviderId;
  configured: boolean;
  keyHint: string | null;
};

export type SupportedChatModel = {
  provider: LlmProviderId;
  modelId: string;
  displayName: string;
  supportsReasoning: boolean;
  sortOrder: number;
};

export type ChatStatus = {
  ready: boolean;
  providersConfigured: LlmProviderId[];
  models: SupportedChatModel[];
};

export function listLlmCredentials(workspaceId: string) {
  return unwrap<LlmCredentialStatus[]>(
    api.get(`/workspaces/${workspaceId}/llm/credentials`),
  );
}

export function upsertLlmCredential(
  workspaceId: string,
  input: { provider: LlmProviderId; apiKey: string },
) {
  return unwrap<LlmCredentialStatus>(
    api.put(`/workspaces/${workspaceId}/llm/credentials`, input),
  );
}

export function deleteLlmCredential(workspaceId: string, provider: LlmProviderId) {
  return unwrap<{ deleted: boolean }>(
    api.delete(`/workspaces/${workspaceId}/llm/credentials`, { data: { provider } }),
  );
}

export function listLlmModels(workspaceId: string, provider?: LlmProviderId) {
  return unwrap<SupportedChatModel[]>(
    api.get('/llm/models', { params: { workspaceId, provider } }),
  );
}

export function getChatStatus(workspaceId: string) {
  return unwrap<ChatStatus>(api.get('/chat/status', { params: { workspaceId } }));
}
