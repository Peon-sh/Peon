'use client';

import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Placeholder assistant bubble shown only before the assistant message exists. */
export function LoadingBubble({ className }: { className?: string }) {
  return (
    <article
      className={cn('grid w-full grid-cols-[28px_1fr] gap-3 py-4', className)}
      aria-live="polite"
      aria-label="Assistant is responding"
    >
      <span
        className="bg-secondary text-muted-foreground grid size-7 place-items-center rounded-md"
        aria-hidden
      >
        <Bot className="size-3.5" />
      </span>
      <div className="text-muted-foreground flex h-7 items-center gap-2 text-sm">
        <span>Working…</span>
        <span className="flex items-center gap-1" aria-hidden>
          <span className="bg-muted-foreground size-1 animate-bounce rounded-full [animation-delay:-0.3s]" />
          <span className="bg-muted-foreground size-1 animate-bounce rounded-full [animation-delay:-0.15s]" />
          <span className="bg-muted-foreground size-1 animate-bounce rounded-full" />
        </span>
      </div>
    </article>
  );
}
