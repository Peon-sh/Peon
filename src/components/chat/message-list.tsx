'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatAddToolApproveResponseFunction, UIMessage } from 'ai';
import { LoadingBubble } from '@/components/chat/loading-bubble';
import { MessageBubble } from '@/components/chat/message-bubble';
import { CHAT_MESSAGE_PAGE_SIZE } from '@/services/internal/chat/message-window';

/**
 * Keep prior messages on a stable reference while the latest message streams.
 * Otherwise every reasoning/token tick re-renders old Recharts trees and freezes the UI.
 */
function useFrozenHistory(messages: UIMessage[]): {
  history: UIMessage[];
  live: UIMessage | null;
} {
  const historyIds = messages
    .slice(0, -1)
    .map((message) => message.id)
    .join('\0');
  const history = useMemo(
    () => messages.slice(0, -1),
    // historyIds tracks prior messages; messages is read when ids change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable history until ids change
    [historyIds],
  );

  return {
    history,
    live: messages[messages.length - 1] ?? null,
  };
}

const HistoryMessages = memo(
  function HistoryMessages({
    messages,
    threadId,
    addToolApprovalResponse,
  }: {
    messages: UIMessage[];
    threadId: string;
    addToolApprovalResponse: ChatAddToolApproveResponseFunction;
  }) {
    return (
      <>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            threadId={threadId}
            streaming={false}
            awaitingFirstToken={false}
            addToolApprovalResponse={addToolApprovalResponse}
          />
        ))}
      </>
    );
  },
  (prev, next) => prev.messages === next.messages && prev.threadId === next.threadId,
);

export function MessageList({
  messages,
  status,
  threadId,
  forceLoading = false,
  addToolApprovalResponse,
}: {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  threadId: string;
  forceLoading?: boolean;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const scrollFrameRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const [pageState, setPageState] = useState({
    threadId,
    visibleCount: CHAT_MESSAGE_PAGE_SIZE,
  });
  if (pageState.threadId !== threadId) {
    setPageState({ threadId, visibleCount: CHAT_MESSAGE_PAGE_SIZE });
  }
  const visibleCount = pageState.visibleCount;

  // Match previous behavior: new thread resets near-bottom tracking (ref only).
  useEffect(() => {
    nearBottomRef.current = true;
  }, [threadId]);

  const windowed = messages.slice(-visibleCount);
  const hasOlder = messages.length > visibleCount;
  const { history, live } = useFrozenHistory(windowed);

  const assistantTurnStarted = live?.role === 'assistant';
  const showLoadingBubble =
    (forceLoading || status === 'submitted' || status === 'streaming') &&
    !assistantTurnStarted;
  const liveStreaming =
    !!live &&
    live.role === 'assistant' &&
    (status === 'streaming' || status === 'submitted');

  const loadOlder = useCallback(() => {
    if (!hasOlder || loadingOlderRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    loadingOlderRef.current = true;
    const previousHeight = container.scrollHeight;
    const previousTop = container.scrollTop;

    setPageState((state) =>
      state.threadId === threadId
        ? {
            ...state,
            visibleCount: Math.min(state.visibleCount + CHAT_MESSAGE_PAGE_SIZE, messages.length),
          }
        : state,
    );

    requestAnimationFrame(() => {
      const next = containerRef.current;
      if (next) {
        next.scrollTop = previousTop + (next.scrollHeight - previousHeight);
      }
      loadingOlderRef.current = false;
    });
  }, [hasOlder, messages.length, threadId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !nearBottomRef.current) return;
    cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(scrollFrameRef.current);
  }, [live, status, showLoadingBubble, history.length]);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
      onScroll={(event) => {
        const element = event.currentTarget;
        nearBottomRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 120;
        if (element.scrollTop < 96) {
          loadOlder();
        }
      }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
        {hasOlder && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
            >
              Load earlier messages
            </button>
          </div>
        )}
        <HistoryMessages
          messages={history}
          threadId={threadId}
          addToolApprovalResponse={addToolApprovalResponse}
        />
        {live && (
          <MessageBubble
            key={live.id}
            message={live}
            threadId={threadId}
            streaming={liveStreaming}
            awaitingFirstToken={liveStreaming}
            addToolApprovalResponse={addToolApprovalResponse}
          />
        )}
        {showLoadingBubble && <LoadingBubble />}
      </div>
    </div>
  );
}
