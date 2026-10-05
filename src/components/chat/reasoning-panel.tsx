'use client';

import { useState } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import type { ReasoningUIPart } from 'ai';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export function ReasoningPanel({
  part,
  streaming,
  defaultOpen = false,
}: {
  part: ReasoningUIPart;
  streaming: boolean;
  defaultOpen?: boolean;
}) {
  const isActive = streaming && part.state !== 'done';
  const [manuallyOpen, setManuallyOpen] = useState(defaultOpen);
  const open = isActive || manuallyOpen;

  return (
    <Collapsible
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isActive) setManuallyOpen(nextOpen);
      }}
      className="bg-card border-border overflow-hidden rounded-lg border"
    >
      <CollapsibleTrigger className="text-foreground hover:bg-secondary flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-colors">
        <Brain className={cn('text-muted-foreground size-3.5', isActive && 'text-primary animate-pulse')} />
        <span>{isActive ? 'Thinking…' : open ? 'Thinking' : 'Show thinking'}</span>
        <ChevronDown className={cn('text-muted-foreground ml-auto size-3.5 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="text-muted-foreground border-border max-h-64 overflow-auto border-t px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {part.text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
