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

  const stateLabel = part.state.replaceAll('-', ' ');
  const stateText = stateLabel.charAt(0).toUpperCase() + stateLabel.slice(1);

  if (compact) {
    return (
      <div className="bg-card border-border overflow-hidden rounded-lg border">
        <button
          type="button"
          className="hover:bg-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <Wrench
            className={cn('size-3.5 shrink-0', failed ? 'text-destructive' : 'text-muted-foreground')}
          />
          <span className="truncate font-mono">{name}</span>
          <span
            className={cn(
              'ml-auto shrink-0 text-xs font-normal',
              failed ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {stateText}
          </span>
          <ChevronDown
            className={cn(
              'text-muted-foreground size-3.5 shrink-0 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
        {expanded && (
          <div className="border-border space-y-2 border-t px-3 py-2 text-sm">
            {'input' in part && part.input !== undefined && (
              <p className="text-muted-foreground truncate">{summarize(part.input)}</p>
            )}
            {output !== undefined && (
              <pre className="bg-secondary max-h-48 overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed">
                {JSON.stringify(redact(output), null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <Wrench
          className={cn('size-3.5 shrink-0', failed ? 'text-destructive' : 'text-muted-foreground')}
        />
        <span className="truncate font-mono">{name}</span>
        <span
          className={cn(
            'ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-normal',
            failed ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground',
          )}
        >
          {stateText}
        </span>
      </div>
      {'input' in part && part.input !== undefined && (
        <div className="text-muted-foreground border-border truncate border-t px-3 py-2 text-sm">
          {summarize(part.input)}
        </div>
      )}
      {output !== undefined && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="border-border w-full justify-start rounded-none border-t px-3"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Hide output' : 'Show output'}
          </Button>
          {expanded && (
            <pre className="bg-secondary border-border max-h-72 overflow-auto border-t p-3 font-mono text-xs leading-relaxed">
              {JSON.stringify(redact(output), null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
