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
    <div className="mx-auto w-full max-w-[720px] shrink-0 px-6 pt-2 pb-4">
      {secretWarning && (
        <div className="text-warning bg-warning/10 border-warning/30 mb-2 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <AlertTriangle className="size-3.5 shrink-0" />
          This message may contain a secret. Remove credentials before sending.
        </div>
      )}

      <div
        className={cn(
          'bg-card border-border rounded-lg border transition-colors',
          'focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-2',
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
          className="max-h-40 min-h-16 w-full resize-none border-0 bg-transparent px-3 py-3 text-base focus-visible:ring-0"
          disabled={disabled}
          aria-label="Chat message"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-2">{modelPicker}</div>
          {busy ? (
            <Button
              size="icon"
              variant="outline"
              onClick={() => void onStop?.()}
              aria-label="Stop"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={() => void submit()}
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>

      <p className="text-muted-foreground mt-2 px-1 text-xs">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
