'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChatThread,
  deleteChatThread,
  getChatThread,
  listChatThreads,
  updateChatThreadModel,
} from '@/services/api/chat';

export const chatQueryKeys = {
  threads: (workspaceId: string) => ['chat-threads', workspaceId] as const,
  thread: (threadId: string) => ['chat-thread', threadId] as const,
};

export function useChatThreads(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: chatQueryKeys.threads(workspaceId ?? ''),
    queryFn: () => listChatThreads(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useChatThread(threadId: string | null | undefined) {
  return useQuery({
    queryKey: chatQueryKeys.thread(threadId ?? ''),
    queryFn: () => getChatThread(threadId!),
    enabled: !!threadId,
  });
}

export function useCreateChatThread(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input?: {
      title?: string;
      modelProvider?: string;
      modelId?: string;
    }) => createChatThread({ workspaceId, ...input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatQueryKeys.threads(workspaceId) });
    },
  });
}

export function useDeleteChatThread(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => deleteChatThread(threadId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatQueryKeys.threads(workspaceId) });
    },
  });
}

export function useUpdateChatThreadModel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      modelProvider,
      modelId,
    }: {
      threadId: string;
      modelProvider: string;
      modelId: string;
    }) => updateChatThreadModel(threadId, { modelProvider, modelId }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: chatQueryKeys.threads(workspaceId) });
      void qc.invalidateQueries({ queryKey: chatQueryKeys.thread(vars.threadId) });
    },
  });
}
