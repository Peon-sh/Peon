'use client';

import { useState } from 'react';
import {
  formatLocalDateTime,
  parseApiDate,
  type LocalDateTimeStyle,
} from '@/lib/datetime';
import { cn } from '@/lib/utils';

/**
 * Renders an API UTC timestamp in the browser's local timezone.
 * Waits until mount so server/UTC never paints the wrong wall clock.
 */
export function LocalDateTime({
  value,
  style = 'datetime',
  className,
  placeholder = '…',
}: {
  value: string | number | Date | null | undefined;
  style?: LocalDateTimeStyle;
  className?: string;
  placeholder?: string;
}) {
  const instant = parseApiDate(value);
  const [label, setLabel] = useState<string | null>(null);
  const [prevSource, setPrevSource] = useState<{
    value: typeof value;
    style: LocalDateTimeStyle;
    mounted: boolean;
  }>({ value, style, mounted: false });

  const mounted = typeof window !== 'undefined';
  if (
    value !== prevSource.value ||
    style !== prevSource.style ||
    mounted !== prevSource.mounted
  ) {
    setPrevSource({ value, style, mounted });
    setLabel(mounted ? formatLocalDateTime(value, style) : null);
  }

  return (
    <time
      dateTime={instant?.toISOString()}
      className={cn(className)}
      title={instant ? instant.toISOString() : undefined}
    >
      {label ?? placeholder}
    </time>
  );
}
