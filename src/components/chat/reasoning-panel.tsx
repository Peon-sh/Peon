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
      className="rounded-md border"
    >
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-3 py-1.5 text-[11px]">
        <Brain className={cn('size-3', isActive && 'text-phosphor animate-pulse')} />
        <span>{isActive ? 'Thinking…' : open ? 'Thinking' : 'Show thinking'}</span>
        <ChevronDown className={cn('ml-auto size-3 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="text-muted-foreground max-h-64 overflow-auto border-t px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap">
          {part.text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
