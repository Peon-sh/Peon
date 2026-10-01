'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Info, ShieldAlert } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'warning' | 'danger';

const TONE = {
  info: { box: 'border-info/30 bg-info/5', text: 'text-info', Icon: Info },
  warning: { box: 'border-warning/30 bg-warning/5', text: 'text-warning', Icon: AlertTriangle },
  danger: { box: 'border-destructive/30 bg-destructive/5', text: 'text-destructive', Icon: ShieldAlert },
} as const;

export function Callout({
  title,
  tone = 'info',
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
}: {
  title: string;
  tone?: Tone;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <Collapsible defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} className={cn('min-w-0 overflow-hidden rounded-lg border', t.box, className)}>
      <CollapsibleTrigger className={cn('group flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-base font-medium', t.text)}>
        <t.Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="size-4 shrink-0 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="text-muted-foreground min-w-0 space-y-3 border-t border-inherit px-3 py-3 text-base">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CalloutSteps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-4">{children}</ol>;
}

export function CalloutBullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-4">{children}</ul>;
}
