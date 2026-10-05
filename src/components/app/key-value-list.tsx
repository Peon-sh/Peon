import * as React from 'react';
import { cn } from '@/lib/utils';

export function KeyValueList({
  items,
  className,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode; mono?: boolean }>;
  className?: string;
}) {
  return (
    <dl className={cn('divide-border divide-y', className)}>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[160px_1fr] gap-4 py-2.5 text-base">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={cn('min-w-0 break-words', item.mono && 'font-mono')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
