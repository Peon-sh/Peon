'use client';

import * as React from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * App-wide modal shell.
 *
 * Layout (always):
 * - Header: title (+ optional description) and close (X)
 * - Body: main content
 * - Footer: actions
 */
export const Modal = Dialog;
export const ModalTrigger = DialogTrigger;
export const ModalClose = DialogClose;
export const ModalTitle = DialogTitle;
export const ModalDescription = DialogDescription;

const SIZE_CLASS = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
} as const;

export function ModalContent({
  className,
  size = 'md',
  children,
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  size?: keyof typeof SIZE_CLASS;
}) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        'flex max-h-[min(90vh,840px)] w-full flex-col gap-0 overflow-hidden p-0',
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

export function ModalHeader({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="modal-header"
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3',
        className,
      )}
      {...props}
    >
      <DialogHeader className="min-w-0 flex-1 gap-1 text-left">{children}</DialogHeader>
      <DialogClose asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="mt-0.5 shrink-0">
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </DialogClose>
    </div>
  );
}

export function ModalBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="modal-body"
      className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm', className)}
      {...props}
    />
  );
}

export function ModalFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      data-slot="modal-footer"
      className={cn(
        'shrink-0 gap-2 border-t border-border/70 px-4 py-3 sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}
