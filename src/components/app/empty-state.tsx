import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div className={cn('bg-card border-border w-full rounded-lg border px-4 py-12 text-center', className)}>
      {Icon ? (
        <span className="bg-secondary text-muted-foreground mx-auto grid size-10 place-items-center rounded-lg">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-md mt-4 font-medium">{title}</p>
      {description ? <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-base">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
