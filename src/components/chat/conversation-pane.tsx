'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Composer } from '@/components/chat/composer';
import { MessageList } from '@/components/chat/message-list';
import { ModelPicker, type ModelSelection } from '@/components/chat/model-picker';
import {
  chatQueryKeys,
  useChatThread,
  useUpdateChatThreadModel,
} from '@/lib/queries/chat';
import type { SupportedChatModel } from '@/services/api/llm';

function toUiMessages(
  messages:
    | Array<{ id: string; role: string; parts: unknown; status: string; createdAt: string }>
    | undefined,
): UIMessage[] {
  return (messages ?? [])
    .filter((message) => ['system', 'user', 'assistant'].includes(message.role.toLowerCase()))
    .map((message) => ({
      id: message.id,
      role: message.role.toLowerCase() as UIMessage['role'],
      parts: Array.isArray(message.parts) ? (message.parts as UIMessage['parts']) : [],
      metadata: { createdAt: message.createdAt },
    }));
}

export function ConversationPane({
  threadId,
  workspaceId,
  availableModels,
  chatReady,
  pendingPrompt,
  onPromptConsumed,
}: {
  threadId: string;
  workspaceId: string;
  availableModels: SupportedChatModel[];
  chatReady: boolean;
  pendingPrompt?: string | null;
  onPromptConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: thread, isLoading } = useChatThread(threadId);
  const updateModel = useUpdateChatThreadModel(workspaceId);
  const initialMessages = useMemo(() => toUiMessages(thread?.messages), [thread?.messages]);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/chat/threads/${threadId}/messages`,
      }),
    [threadId],
  );
  const hydratedThreadRef = useRef<string | null>(null);
  const sentPromptRef = useRef<string | null>(null);
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null);
  const [prevModelSource, setPrevModelSource] = useState({
    thread,
    availableModels,
  });
  if (
    thread !== prevModelSource.thread ||
    availableModels !== prevModelSource.availableModels
  ) {
    setPrevModelSource({ thread, availableModels });
    if (thread) {
      if (
        thread.modelProvider &&
        thread.modelId &&
        availableModels.some(
          (model) =>
            model.provider === thread.modelProvider && model.modelId === thread.modelId,
        )
      ) {
        setModelSelection({
          provider: thread.modelProvider as ModelSelection['provider'],
          modelId: thread.modelId,
        });
      } else {
        const first = availableModels[0];
        if (first) {
          setModelSelection({ provider: first.provider, modelId: first.modelId });
        }
      }
    }
  }

  const {
    messages,
    sendMessage,
    status,
    stop,
    setMessages,
    addToolApprovalResponse,
    error,
  } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    throttle: 100,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.threads(workspaceId) });
    },
  });

  useEffect(() => {
    if (!thread || hydratedThreadRef.current === threadId) return;
    hydratedThreadRef.current = threadId;
    setMessages(toUiMessages(thread.messages));
  }, [setMessages, thread, threadId]);

  useEffect(() => {
    if (
      isLoading ||
      !thread ||
      !pendingPrompt ||
      sentPromptRef.current === pendingPrompt
    ) {
      return;
    }
    sentPromptRef.current = pendingPrompt;
    onPromptConsumed?.();
    void sendMessage({
      text: pendingPrompt,
      metadata: { createdAt: new Date().toISOString() },
    });
  }, [isLoading, onPromptConsumed, pendingPrompt, sendMessage, thread]);

  async function handleModelChange(next: ModelSelection) {
    setModelSelection(next);
    try {
      await updateModel.mutateAsync({
        threadId,
        modelProvider: next.provider,
        modelId: next.modelId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update model');
    }
  }

  const busy = status === 'submitted' || status === 'streaming';

  return (
    <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="bg-card/70 flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{thread?.title || 'New chat'}</h1>
          <p className="text-faint text-[10px]">Workspace assistant</p>
        </div>
      </header>

      {isLoading && messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-muted-foreground animate-pulse text-xs">Loading conversation…</span>
        </div>
      ) : (
        <MessageList
          messages={messages}
          status={status}
          threadId={threadId}
          forceLoading={!!pendingPrompt && status === 'ready'}
          addToolApprovalResponse={addToolApprovalResponse}
        />
      )}

      {error && (
        <div className="text-destructive bg-destructive/10 mx-3 mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{error.message}</span>
        </div>
      )}
      <Composer
        status={status}
        onStop={stop}
        onSend={(text) =>
          sendMessage({
            text,
            metadata: { createdAt: new Date().toISOString() },
          })
        }
        disabled={isLoading || !chatReady}
        modelPicker={
          chatReady && availableModels.length > 0 ? (
            <ModelPicker
              models={availableModels}
              value={modelSelection}
              onChange={(next) => void handleModelChange(next)}
              disabled={busy || updateModel.isPending}
            />
          ) : null
        }
      />
    </section>
  );
}
