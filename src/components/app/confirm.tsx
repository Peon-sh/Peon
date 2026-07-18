'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Confirm dialog with the same shell as Modal:
 * header (title) → body (description) → footer (actions).
 *
 * Defaults to danger styling for delete/remove. Pass `variant="outline"`
 * (and `confirmVariant="default"`) for non-destructive confirms.
 */
export function ConfirmButton({
  onConfirm,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  disabled,
  children,
  variant = 'destructive',
  size = 'sm',
  className,
  confirmVariant = 'destructive',
}: {
  onConfirm: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
  /** Dialog confirm button style. Defaults to destructive for delete/remove. */
  confirmVariant?: 'default' | 'destructive';
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={disabled}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        className={cn(
          'flex max-h-[min(90vh,840px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md',
        )}
      >
        <div
          data-slot="confirm-header"
          className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3"
        >
          <AlertDialogHeader className="min-w-0 flex-1 gap-1 place-items-start text-left sm:place-items-start sm:text-left">
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </AlertDialogHeader>
        </div>
        <div data-slot="confirm-body" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </div>
        <AlertDialogFooter
          data-slot="confirm-footer"
          className="shrink-0 gap-2 border-t border-border/70 px-4 py-3 sm:justify-end"
        >
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant === 'destructive' ? 'destructive' : 'default'}
            className={
              confirmVariant === 'destructive'
                ? 'bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:text-white dark:hover:bg-destructive/90'
                : undefined
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
