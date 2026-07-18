import * as React from 'react';
import { cn } from '@/lib/utils';

/** Full-width page wrapper with consistent vertical rhythm. */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('min-w-0 w-full space-y-6', className)}>{children}</div>;
}

/**
 * Right-aligned page actions row. Page titles live in the sidebar/header
 * navigation — this component only renders optional action buttons.
 */
export function PageHeader({
  actions,
  className,
}: {
  /** @deprecated Title is no longer rendered; navigation shows the page name. */
  title?: React.ReactNode;
  /** @deprecated Description is no longer rendered. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  if (!actions) return null;

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-4', className)}>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

/** A titled content section used inside settings-like pages. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div>
            {title ? (
              <h2 className="panel-title-slashes text-[12.5px] font-bold tracking-wide">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Bordered panel surface with an optional `// title` header row and an
 * optional separated footer where actions (save, add, …) belong.
 */
export function Panel({
  id,
  title,
  actions,
  footer,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  /** Right-aligned action row rendered in a separated footer band. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div
      id={id}
      className={cn('bg-card flex min-w-0 flex-col overflow-hidden rounded-lg border', className)}
    >
      {(title || actions) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
          {title ? (
            <span className="panel-title-slashes min-w-0 truncate text-[12.5px] font-bold tracking-wide">
              {title}
            </span>
          ) : (
            <span />
          )}
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={cn('min-h-0 min-w-0 flex-1', contentClassName)}>{children}</div>
      {footer ? (
        <div className="bg-secondary/40 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2.5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
