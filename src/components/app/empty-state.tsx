import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Dashed empty placeholder with a glyph, display-font title, and action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border-bright text-muted-foreground w-full rounded-lg border border-dashed px-4 py-12 text-center',
        className,
      )}
    >
      {Icon ? <Icon className="text-faint mx-auto size-6" /> : null}
      <p className="text-foreground font-heading mt-3 text-sm font-bold">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-xs">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
