'use client';

import { useState } from 'react';
import { Crown, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
      <Alert variant="warning" role="status" className={cn('pr-10', className)}>
        {billingRelated ? <Crown /> : <Lock />}
        <AlertTitle>{heading}</AlertTitle>
        <AlertDescription>
          <span className="block">{accessBlockMessage(reason)}</span>
          <div className="mt-2 flex items-center gap-2">
            {billingRelated && workspaceId ? (
              <Button size="sm" onClick={() => setPaywallOpen(true)}>
                {reason === 'over_limit' ? 'Add capacity' : 'Upgrade'}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
          </div>
        </AlertDescription>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground absolute top-1.5 right-1.5"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
        >
          <X className="size-3.5" />
        </Button>
      </Alert>

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
