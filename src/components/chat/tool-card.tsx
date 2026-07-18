'use client';

import { useState } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from 'ai';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AnyToolPart = ToolUIPart | DynamicToolUIPart;

function redact(value: unknown, key = ''): unknown {
  if (/(password|passwd|secret|token|api.?key|private.?key|credential)/i.test(key)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ]),
    );
  }
  return value;
}

function summarize(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '');
  return Object.entries(redact(value) as Record<string, unknown>)
    .slice(0, 3)
    .map(([key, item]) => `${key}: ${typeof item === 'object' ? '…' : String(item)}`)
    .join(' · ');
}

export function ToolCard({
  part,
  compact = false,
}: {
  part: AnyToolPart;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const output =
    part.state === 'output-available'
      ? part.output
      : part.state === 'output-error'
        ? { error: part.errorText }
        : undefined;
  const failed = part.state === 'output-error' || part.state === 'output-denied';
  const name = getToolName(part);

  if (compact) {
    return (
      <div className="bg-muted/30 overflow-hidden rounded border text-[11px]">
        <button
          type="button"
          className="hover:bg-muted/50 flex w-full items-center gap-2 px-2 py-1.5 text-left"
          onClick={() => setExpanded((value) => !value)}
        >
          <Wrench className={cn('size-3', failed ? 'text-destructive' : 'text-muted-foreground')} />
          <span className="font-mono">{name}</span>
          <span className="text-faint ml-auto">{part.state.replaceAll('-', ' ')}</span>
          <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
        </button>
        {expanded && (
          <div className="space-y-1 border-t px-2 py-1.5">
            {'input' in part && part.input !== undefined && (
              <p className="text-muted-foreground truncate">{summarize(part.input)}</p>
            )}
            {output !== undefined && (
              <pre className="max-h-48 overflow-auto font-mono text-[10px] leading-relaxed">
                {JSON.stringify(redact(output), null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-muted/40 overflow-hidden rounded-md border text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <Wrench className={cn('size-3.5', failed ? 'text-destructive' : 'text-muted-foreground')} />
        <span className="font-mono font-medium">{name}</span>
        <span
          className={cn(
            'ml-auto rounded-full px-1.5 py-0.5 text-[10px]',
            failed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
          )}
        >
          {part.state.replaceAll('-', ' ')}
        </span>
      </div>
      {'input' in part && part.input !== undefined && (
        <div className="text-muted-foreground truncate border-t px-3 py-2">
          {summarize(part.input)}
        </div>
      )}
      {output !== undefined && (
        <>
          <Button
            variant="ghost"
            className="h-7 w-full justify-start rounded-none border-t px-3"
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Hide output' : 'Show output'}
          </Button>
          {expanded && (
            <pre className="max-h-72 overflow-auto border-t p-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(redact(output), null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
