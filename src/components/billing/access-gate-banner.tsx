'use client';

import { useState } from 'react';
import { Crown, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanPaywallDialog } from '@/components/billing/plan-paywall-dialog';
import {
  accessBlockMessage,
  type AccessBlockReason,
} from '@/lib/billing/workspace-access';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

/**
 * Proactive gate message (role / plan) — not driven by a failed API response.
 * Closable so it doesn’t dominate the page after the user acknowledges it.
 */
export function AccessGateBanner({
  reason,
  className,
  title,
}: {
  reason: AccessBlockReason;
  className?: string;
  title?: string;
}) {
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [dismissed, setDismissed] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  if (!reason || dismissed) return null;

  const billingRelated = reason === 'billing' || reason === 'over_limit';
  const heading =
    title ??
    (reason === 'role'
      ? 'Insufficient permissions'
      : reason === 'over_limit'
        ? 'Over project limit'
        : 'Peon Pro required');

  return (
    <>
      <div
        role="status"
        className={cn(
          'border-border bg-secondary/40 relative flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
          className,
        )}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="absolute top-2 right-2"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
        >
          <X className="size-3.5" />
        </Button>
        <div className="flex min-w-0 items-start gap-3 pr-8">
          {billingRelated ? (
            <Crown className="text-phosphor mt-0.5 size-4 shrink-0" />
          ) : (
            <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          )}
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold">{heading}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {accessBlockMessage(reason)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
          {billingRelated && workspaceId ? (
            <Button size="sm" onClick={() => setPaywallOpen(true)}>
              {reason === 'over_limit' ? 'Add capacity' : 'Upgrade'}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </div>

      {workspaceId ? (
        <PlanPaywallDialog
          open={paywallOpen}
          onOpenChange={setPaywallOpen}
          workspaceId={workspaceId}
          reason={reason === 'over_limit' ? 'seats' : 'subscribe'}
        />
      ) : null}
    </>
  );
}
