'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseRunOutput, type RunOutputBlock } from '@/lib/format-run-output';

const COLLAPSE_CHARS = 480;

function OutputBlockView({ block }: { block: RunOutputBlock }) {
  const long = block.text.length > COLLAPSE_CHARS || block.text.split('\n').length > 12;
  const [expanded, setExpanded] = useState(!long);
  const shown = expanded ? block.text : `${block.text.slice(0, COLLAPSE_CHARS).trimEnd()}…`;

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-[#0a0f0c]">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-2.5 py-1">
        <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
          {block.label}
        </span>
        {long ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-[10px] transition-colors"
          >
            {expanded ? (
              <>
                <ChevronDown className="size-3" /> collapse
              </>
            ) : (
              <>
                <ChevronRight className="size-3" /> expand
              </>
            )}
          </button>
        ) : null}
      </div>
      <pre
        className={cn(
          'max-h-64 overflow-auto px-2.5 py-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap',
          block.kind === 'json' ? 'text-phosphor/90' : 'text-neutral-300',
        )}
      >
        {shown}
      </pre>
    </div>
  );
}

/** Renders task/cron stdout: pretty JSON when possible, otherwise plain output. */
export function RunOutput({
  message,
  className,
}: {
  message: string | null | undefined;
  className?: string;
}) {
  const parsed = parseRunOutput(message);

  if (parsed.empty) {
    return (
      <div
        className={cn(
          'text-muted-foreground rounded-md border border-dashed border-border/50 px-2.5 py-2 text-[10.5px] italic',
          className,
        )}
      >
        no output
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {parsed.blocks.map((block, i) => (
        <OutputBlockView key={`${block.kind}-${i}`} block={block} />
      ))}
    </div>
  );
}
