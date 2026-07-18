'use client';

import type { ReactNode } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * Highlighted, collapsible documentation block used for setup guides,
 * DNS help, and similar instructional content across the app.
 */
export function DocCallout({
  title,
  children,
  defaultOpen = false,
  className,
  open,
  onOpenChange,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        'border-phosphor-dim bg-phosphor/5 min-w-0 overflow-hidden rounded-md border',
        className,
      )}
    >
      <CollapsibleTrigger className="text-phosphor hover:bg-phosphor/10 group flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors data-[state=open]:bg-phosphor/10">
        <BookOpen className="size-3.5 shrink-0 opacity-80" />
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="border-phosphor-dim text-muted-foreground min-w-0 space-y-3 border-t px-3 py-3 text-[12px] leading-relaxed">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Ordered steps inside a DocCallout. */
export function DocSteps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-4">{children}</ol>;
}

/** Bullet list inside a DocCallout. */
export function DocBullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-4">{children}</ul>;
}
