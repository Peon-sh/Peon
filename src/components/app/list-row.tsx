import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const content = (
    <>
      {leading ? <span className="text-muted-foreground shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{title}</span>
        {subtitle ? <span className="text-muted-foreground block truncate text-sm">{subtitle}</span> : null}
      </span>
      {meta ? <span className="text-muted-foreground hidden shrink-0 text-sm sm:block">{meta}</span> : null}
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
    </>
  );
  const cls = cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', (href || onClick) && 'hover:bg-secondary', className);
  if (href) return <Link href={href} className={cls}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>;
  return <div className={cls}>{content}</div>;
}
