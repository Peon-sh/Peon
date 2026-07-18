import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Terminal-style stat card: uppercase tracked label, big mono value,
 * small delta/hint line. Optionally links to a destination.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  accent = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  /** Render the value in the phosphor accent color. */
  accent?: boolean;
  className?: string;
}) {
  const inner = (
    <div
      className={cn(
        'bg-card rounded-lg border p-4 transition-colors',
        href && 'hover:border-border-bright hover:bg-secondary',
        className,
      )}
    >
      <div className="text-muted-foreground flex items-center justify-between text-[11px] font-medium tracking-[0.12em] uppercase">
        <span>{label}</span>
        {Icon ? <Icon className="size-3.5" /> : null}
      </div>
      <div
        className={cn(
          'mt-2 font-mono text-3xl font-bold tracking-tight',
          accent && 'text-phosphor',
        )}
      >
        {value}
      </div>
      {hint ? <p className="text-muted-foreground mt-1 text-[11px]">{hint}</p> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
