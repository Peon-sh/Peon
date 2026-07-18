'use client';

import { cn } from '@/lib/utils';

/** Placeholder assistant bubble shown only before the assistant message exists. */
export function LoadingBubble({ className }: { className?: string }) {
  return (
    <article
      className={cn('flex w-full flex-col items-start gap-1.5', className)}
      aria-live="polite"
      aria-label="Assistant is responding"
    >
      <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]">
        <span className="bg-phosphor size-1.5 animate-pulse rounded-full" />
        <span>Working…</span>
        <span className="ml-1 flex items-center gap-1">
          <span className="bg-muted-foreground/60 size-1 animate-bounce rounded-full [animation-delay:-0.3s]" />
          <span className="bg-muted-foreground/60 size-1 animate-bounce rounded-full [animation-delay:-0.15s]" />
          <span className="bg-muted-foreground/60 size-1 animate-bounce rounded-full" />
        </span>
      </div>
    </article>
  );
}
