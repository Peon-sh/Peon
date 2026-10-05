import * as React from 'react';
import { cn } from '@/lib/utils';

export function Panel({
  id,
  title,
  description,
  actions,
  footer,
  padded = true,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const hasHeader = !!title || !!actions;
  return (
    <section
      id={id}
      data-slot="panel"
      className={cn('bg-card border-border flex min-w-0 flex-col overflow-hidden rounded-lg border', className)}
    >
      {hasHeader ? (
        <div data-slot="panel-header" className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-md truncate font-medium">{title}</h2> : null}
            {description ? <p className="text-muted-foreground mt-0.5 text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn('min-h-0 min-w-0 flex-1', padded && 'p-4', contentClassName)}>{children}</div>
      {footer ? (
        <div data-slot="panel-footer" className="bg-secondary/50 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
