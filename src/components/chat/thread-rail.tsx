'use client';

import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { ConfirmButton } from '@/components/app/confirm';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatThreadListItem } from '@/services/api/chat';
import { cn } from '@/lib/utils';

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}

export function ThreadRail({
  threads,
  activeThreadId,
  onSelect,
  onNew,
  onDelete,
  deleting,
}: {
  threads: ChatThreadListItem[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onDelete: (threadId: string) => void;
  deleting?: boolean;
}) {
  return (
    <aside className="bg-card flex min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r">
      <div className="border-b p-3">
        <Button className="w-full justify-start" onClick={onNew}>
          <Plus />
          New chat
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block [&>[data-slot=scroll-area-viewport]>div]:!min-w-0">
        <div className="w-full min-w-0 space-y-1 p-2">
          {threads.map((thread) => {
            const active = thread.id === activeThreadId;
            const title = thread.title || 'New chat';
            return (
              <div
                key={thread.id}
                className={cn(
                  'group relative flex w-full min-w-0 items-center overflow-hidden rounded-md border border-transparent',
                  active && 'bg-accent border-border',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2 py-2 pr-8 text-left"
                  title={title}
                >
                  <MessageSquare
                    className={cn(
                      'text-muted-foreground size-3.5 shrink-0',
                      active && 'text-phosphor',
                    )}
                  />
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-xs font-medium">
                      {title}
                    </span>
                    <span className="text-faint block truncate text-[10px]">
                      {relativeTime(thread.updatedAt)}
                    </span>
                  </span>
                </button>
                <ConfirmButton
                  size="icon-xs"
                  variant="destructive"
                  className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  disabled={deleting}
                  title="Delete chat?"
                  description={`“${title}” and its messages will be permanently deleted.`}
                  confirmLabel="Delete"
                  onConfirm={() => onDelete(thread.id)}
                >
                  <Trash2 />
                  <span className="sr-only">Delete {title}</span>
                </ConfirmButton>
              </div>
            );
          })}
          {threads.length === 0 && (
            <p className="text-muted-foreground px-3 py-8 text-center text-xs">
              No conversations yet
            </p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
