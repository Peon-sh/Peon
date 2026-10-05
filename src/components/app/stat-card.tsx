import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  tone?: 'default' | 'warning' | 'destructive';
  className?: string;
}) {
  const toneClass = tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : undefined;
  const inner = (
    <div className={cn('bg-card border-border rounded-lg border p-4 transition-colors', href && 'hover:bg-secondary', className)}>
      <div className="text-muted-foreground flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        {Icon ? <Icon className={cn('size-4', toneClass)} /> : null}
      </div>
      <div className={cn('text-display mt-2 font-sans font-semibold tracking-tight tabular-nums', toneClass)}>{value}</div>
      {hint ? <p className="text-muted-foreground mt-1 text-sm">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
