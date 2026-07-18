'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function looksLikeSecret(value: string): boolean {
  const assignment =
    /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key)\s*=\s*\S{8,}/i;
  const longBase64 = /(?:^|\s)[A-Za-z0-9+/]{48,}={0,2}(?:\s|$)/;
  return assignment.test(value) || longBase64.test(value);
}

export function Composer({
  onSend,
  onStop,
  status,
  disabled,
  modelPicker,
}: {
  onSend: (text: string) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  disabled?: boolean;
  modelPicker?: ReactNode;
}) {
  const [text, setText] = useState('');
  const secretWarning = looksLikeSecret(text);
  const busy = status === 'submitted' || status === 'streaming';
  const canSend = !disabled && !busy && !!text.trim();

  async function submit() {
    const value = text.trim();
    if (!value || busy || disabled) return;
    setText('');
    await onSend(value);
  }

  return (
    <div className="border-t px-3 pt-3 pb-2">
      {modelPicker && <div className="mb-2 flex items-center gap-2">{modelPicker}</div>}

      {secretWarning && (
        <div className="text-warning bg-warning/10 mb-2 flex items-center gap-2 rounded-md border border-current/20 px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          This message may contain a secret. Remove credentials before sending.
        </div>
      )}

      <div
        className={cn(
          'bg-background relative rounded-xl border border-border/80 shadow-sm transition-colors',
          'focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/20',
        )}
      >
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask about your workspace…"
          className="max-h-40 min-h-[72px] w-full resize-none border-0 bg-transparent px-3.5 py-3 pr-12 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 dark:bg-transparent"
          disabled={disabled}
          aria-label="Chat message"
        />
        <div className="absolute right-2.5 bottom-2.5">
          {busy ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              onClick={() => void onStop?.()}
              aria-label="Stop"
            >
              <Square className="size-2.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              className="rounded-full"
              onClick={() => void submit()}
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <p className="text-muted-foreground/70 mt-1.5 px-0.5 text-[10px]">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
