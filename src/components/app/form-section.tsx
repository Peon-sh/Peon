'use client';

import * as React from 'react';
import { Panel } from './panel';
import { cn } from '@/lib/utils';

export function FormSection({
  id,
  title,
  description,
  onSubmit,
  footer,
  children,
  className,
}: {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const body = (
    <Panel id={id} title={title} description={description} footer={footer} className={className} contentClassName="space-y-6">
      {children}
    </Panel>
  );
  return onSubmit ? <form onSubmit={onSubmit}>{body}</form> : body;
}

export function FormField({
  label,
  htmlFor,
  description,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="form-field" className={cn('grid gap-2 lg:grid-cols-[220px_1fr] lg:gap-6', className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </div>
  );
}
