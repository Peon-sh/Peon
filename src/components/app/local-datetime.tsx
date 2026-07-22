'use client';

import { useEffect, useState } from 'react';
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
  const [label, setLabel] = useState<string | null>(null);
  const instant = parseApiDate(value);

  useEffect(() => {
    setLabel(formatLocalDateTime(value, style));
  }, [value, style]);

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
