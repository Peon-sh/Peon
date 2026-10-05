'use client';

import { useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Crown, X } from 'lucide-react';
import { PlanPaywallDialog } from '@/components/billing/plan-paywall-dialog';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { getBillingSummary } from '@/services/api/billing';
import { useAuthStore } from '@/store/auth';
import { DiscountBadge } from '@/components/billing/discount-badge';
import { publicEnv } from '@/lib/env';
import {
  formatUsdFromCents,
  PEON_PRO_MONTHLY_CENTS,
  PEON_PRO_YEARLY_CENTS,
  PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS,
  yearlyDiscountPercent,
} from '@/lib/billing/pricing';
import { cn } from '@/lib/utils';

function dismissKey(workspaceId: string) {
  return `peon.sidebarUpgradePro.dismissed.${workspaceId}`;
}

function readDismissed(workspaceId: string | null): boolean {
  if (!workspaceId || typeof window === 'undefined') return false;
  return localStorage.getItem(dismissKey(workspaceId)) === '1';
}

export function SidebarUpgradePro() {
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const [open, setOpen] = useState(false);
  // Same initial false as before (effect hydrated after mount); sync when workspace changes.
  const [dismissed, setDismissed] = useState(false);
  const [prevWorkspaceId, setPrevWorkspaceId] = useState<string | null | undefined>(undefined);
  if (currentWorkspaceId !== prevWorkspaceId) {
    setPrevWorkspaceId(currentWorkspaceId);
    setDismissed(readDismissed(currentWorkspaceId));
  }
  const discount = yearlyDiscountPercent();

  const { data: billing } = useQuery({
    queryKey: ['billing', currentWorkspaceId],
    queryFn: () => getBillingSummary(currentWorkspaceId!),
    enabled: !!currentWorkspaceId && publicEnv.billingEnabled,
    staleTime: 60_000,
  });

  const dismiss = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentWorkspaceId) return;
    localStorage.setItem(dismissKey(currentWorkspaceId), '1');
    setDismissed(true);
  };

  if (!publicEnv.billingEnabled || !currentWorkspaceId) return null;
  if (!billing || billing.entitled || dismissed) return null;

  return (
    <>
      <div className="px-2 pb-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <div className={cn('relative', collapsed ? '' : 'border-border bg-card rounded-lg border p-3')}>
          {!collapsed ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground absolute top-1 right-1 z-10"
              aria-label="Dismiss upgrade card"
              onClick={dismiss}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}

          {collapsed ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              title="Upgrade to Peon Pro"
              className="text-primary hover:bg-secondary mx-auto flex size-8 items-center justify-center rounded-md transition-colors"
            >
              <Crown className="size-4" />
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 pr-6">
                <span className="text-primary grid size-7 place-items-center">
                  <Crown className="size-4" />
                </span>
                <DiscountBadge percent={discount} size="sm" />
              </div>

              <div className="space-y-0.5">
                <p className="text-sm font-medium">Upgrade to Pro</p>
                <p className="text-foreground text-xl font-semibold">
                  {formatUsdFromCents(PEON_PRO_MONTHLY_CENTS)}
                  <span className="text-muted-foreground ml-0.5 text-xs font-normal">/mo</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  per project · {formatUsdFromCents(PEON_PRO_YEARLY_CENTS)}/yr (
                  {formatUsdFromCents(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS)}/mo)
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                className="group/upgrade w-full"
                title="Upgrade to Peon Pro"
                onClick={() => setOpen(true)}
              >
                Get Pro
                <ArrowRight className="size-3.5 transition-transform group-hover/upgrade:translate-x-0.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <PlanPaywallDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={currentWorkspaceId}
        reason="subscribe"
      />
    </>
  );
}
