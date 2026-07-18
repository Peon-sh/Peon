import { api, unwrap } from '@/lib/http/axios';

export interface ChatThreadListItem {
  id: string;
  title: string | null;
  modelProvider: string | null;
  modelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThreadDetail extends ChatThreadListItem {
  workspaceId: string;
  userId: string;
  messages: Array<{
    id: string;
    role: string;
    parts: unknown;
    status: string;
    createdAt: string;
  }>;
}

export function listChatThreads(workspaceId: string) {
  return unwrap<ChatThreadListItem[]>(
    api.get('/chat/threads', { params: { workspaceId } }),
  );
}

export function createChatThread(input: {
  workspaceId: string;
  title?: string;
  modelProvider?: string;
  modelId?: string;
}) {
  return unwrap<ChatThreadListItem>(api.post('/chat/threads', input));
}

export function getChatThread(threadId: string) {
  return unwrap<ChatThreadDetail>(api.get(`/chat/threads/${threadId}`));
}

export function renameChatThread(threadId: string, title: string) {
  return unwrap<ChatThreadListItem>(api.patch(`/chat/threads/${threadId}`, { title }));
}

export function updateChatThreadModel(
  threadId: string,
  input: { modelProvider: string; modelId: string },
) {
  return unwrap<ChatThreadListItem>(api.patch(`/chat/threads/${threadId}`, input));
}

export function deleteChatThread(threadId: string) {
  return unwrap<{ deleted: boolean }>(api.delete(`/chat/threads/${threadId}`));
}

export function recordChatApproval(input: {
  approvalId: string;
  toolCallId?: string;
  threadId?: string;
  approved: boolean;
  reason?: string;
}) {
  return unwrap(api.post('/chat/approvals', input));
}
