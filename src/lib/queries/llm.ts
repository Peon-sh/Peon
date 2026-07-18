'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteLlmCredential,
  getChatStatus,
  listLlmCredentials,
  listLlmModels,
  upsertLlmCredential,
  type LlmProviderId,
} from '@/services/api/llm';

export const llmQueryKeys = {
  credentials: (workspaceId: string) => ['llm-credentials', workspaceId] as const,
  models: (workspaceId: string) => ['llm-models', workspaceId] as const,
  chatStatus: (workspaceId: string) => ['chat-status', workspaceId] as const,
};

export function useLlmCredentials(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: llmQueryKeys.credentials(workspaceId ?? ''),
    queryFn: () => listLlmCredentials(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useLlmModels(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: llmQueryKeys.models(workspaceId ?? ''),
    queryFn: () => listLlmModels(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useChatStatus(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: llmQueryKeys.chatStatus(workspaceId ?? ''),
    queryFn: () => getChatStatus(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useUpsertLlmCredential(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: LlmProviderId; apiKey: string }) =>
      upsertLlmCredential(workspaceId, input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: llmQueryKeys.credentials(workspaceId) }),
        qc.invalidateQueries({ queryKey: llmQueryKeys.chatStatus(workspaceId) }),
        qc.invalidateQueries({ queryKey: llmQueryKeys.models(workspaceId) }),
      ]);
    },
  });
}

export function useDeleteLlmCredential(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: LlmProviderId) => deleteLlmCredential(workspaceId, provider),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: llmQueryKeys.credentials(workspaceId) }),
        qc.invalidateQueries({ queryKey: llmQueryKeys.chatStatus(workspaceId) }),
      ]);
    },
  });
}
