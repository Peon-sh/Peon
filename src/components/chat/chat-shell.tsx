'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Composer } from '@/components/chat/composer';
import { ConversationPane } from '@/components/chat/conversation-pane';
import { EmptyState } from '@/components/chat/empty-state';
import { LoadingBubble } from '@/components/chat/loading-bubble';
import { ModelPicker, type ModelSelection } from '@/components/chat/model-picker';
import { ThreadRail } from '@/components/chat/thread-rail';
import {
  useChatThreads,
  useCreateChatThread,
  useDeleteChatThread,
} from '@/lib/queries/chat';
import { useChatStatus } from '@/lib/queries/llm';
import type { SupportedChatModel } from '@/services/api/llm';
import { currentWorkspace, useAuthStore } from '@/store/auth';

const EMPTY_MODELS: SupportedChatModel[] = [];

export function ChatShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const workspace = currentWorkspace();
  const canConfigureLlms = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const threadId = searchParams.get('threadId');
  const { data: threads = [] } = useChatThreads(workspaceId);
  const { data: chatStatus, isLoading: statusLoading } = useChatStatus(workspaceId);
  const createThread = useCreateChatThread(workspaceId ?? '');
  const deleteThread = useDeleteChatThread(workspaceId ?? '');
  const [pendingPrompt, setPendingPrompt] = useState<{
    threadId: string;
    text: string;
  } | null>(null);
  const [startingChat, setStartingChat] = useState(false);
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null);

  const availableModels = chatStatus?.models ?? EMPTY_MODELS;
  const chatReady = !!chatStatus?.ready;

  useEffect(() => {
    if (!availableModels.length) {
      setModelSelection(null);
      return;
    }
    setModelSelection((current) => {
      if (
        current &&
        availableModels.some(
          (model) =>
            model.provider === current.provider && model.modelId === current.modelId,
        )
      ) {
        return current;
      }
      const first = availableModels[0]!;
      return { provider: first.provider, modelId: first.modelId };
    });
  }, [availableModels]);

  function selectThread(nextThreadId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextThreadId) params.set('threadId', nextThreadId);
    else params.delete('threadId');
    const query = params.toString();
    router.replace(query ? `/chat?${query}` : '/chat', { scroll: false });
  }

  async function createAndSend(text?: string) {
    if (!workspaceId || !chatReady || !modelSelection) return;
    setStartingChat(true);
    try {
      const thread = await createThread.mutateAsync({
        title: text ? text.slice(0, 80) : undefined,
        modelProvider: modelSelection.provider,
        modelId: modelSelection.modelId,
      });
      if (text) setPendingPrompt({ threadId: thread.id, text });
      selectThread(thread.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create chat');
      setStartingChat(false);
    }
  }

  async function removeThread(id: string) {
    try {
      await deleteThread.mutateAsync(id);
      if (id === threadId) selectThread(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete chat');
    }
  }

  const gateBusy = statusLoading || !workspaceId;

  return (
    <div className="flex h-[calc(100svh-6rem)] min-h-0 overflow-hidden rounded-lg border">
      <ThreadRail
        threads={threads}
        activeThreadId={threadId}
        onSelect={selectThread}
        onNew={() => {
          setStartingChat(false);
          selectThread(null);
        }}
        onDelete={(id) => void removeThread(id)}
        deleting={deleteThread.isPending}
      />
      {threadId ? (
        <ConversationPane
          key={threadId}
          threadId={threadId}
          workspaceId={workspaceId ?? ''}
          availableModels={availableModels}
          chatReady={chatReady}
          pendingPrompt={pendingPrompt?.threadId === threadId ? pendingPrompt.text : null}
          onPromptConsumed={() => {
            setPendingPrompt(null);
            setStartingChat(false);
          }}
        />
      ) : (
        <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
          {startingChat ? (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
              <LoadingBubble />
            </div>
          ) : (
            <EmptyState
              onPrompt={(prompt) => void createAndSend(prompt)}
              chatReady={!gateBusy && chatReady}
              canConfigureLlms={canConfigureLlms}
            />
          )}
          {chatReady && (
            <Composer
              status={startingChat ? 'submitted' : 'ready'}
              disabled={
                !workspaceId ||
                createThread.isPending ||
                startingChat ||
                !modelSelection
              }
              onSend={(text) => createAndSend(text)}
              modelPicker={
                <ModelPicker
                  models={availableModels}
                  value={modelSelection}
                  onChange={setModelSelection}
                  disabled={startingChat}
                />
              }
            />
          )}
        </section>
      )}
    </div>
  );
}
