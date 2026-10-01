import * as React from 'react';
import { cn } from '@/lib/utils';

export { PageHeader } from './page-header';
export { Panel } from './panel';
export { FormField, FormSection } from './form-section';
export { KeyValueList } from './key-value-list';

/** Full-width page wrapper with consistent vertical rhythm. */
export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('min-w-0 w-full space-y-6', className)}>{children}</div>;
}
