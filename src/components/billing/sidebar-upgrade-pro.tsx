'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Crown } from 'lucide-react';
import { PlanPaywallDialog } from '@/components/billing/plan-paywall-dialog';
import { useSidebar } from '@/components/ui/sidebar';
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

export function SidebarUpgradePro() {
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const [open, setOpen] = useState(false);
  const discount = yearlyDiscountPercent();

  const { data: billing } = useQuery({
    queryKey: ['billing', currentWorkspaceId],
    queryFn: () => getBillingSummary(currentWorkspaceId!),
    enabled: !!currentWorkspaceId && publicEnv.billingEnabled,
    staleTime: 60_000,
  });

  if (!publicEnv.billingEnabled || !currentWorkspaceId) return null;
  if (!billing || billing.entitled) return null;

  return (
    <>
      <div className="px-2 pb-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Upgrade to Peon Pro"
          className={cn(
            'group/upgrade text-left transition-colors',
            collapsed
              ? 'mx-auto flex size-8 items-center justify-center rounded-md border border-phosphor/30 bg-phosphor/10 text-phosphor hover:bg-phosphor/20'
              : 'aspect-square w-full rounded-xl border border-phosphor/25 bg-gradient-to-br from-phosphor/25 via-phosphor/8 to-secondary p-3.5 hover:border-phosphor/55',
          )}
        >
          {collapsed ? (
            <Crown className="size-4" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2.5 text-center">
              <div className="flex w-full items-center justify-between">
                <span className="bg-phosphor/20 text-phosphor grid size-9 place-items-center rounded-lg">
                  <Crown className="size-4" />
                </span>
                <DiscountBadge percent={discount} size="sm" />
              </div>

              <div className="space-y-0.5">
                <p className="text-[13px] font-semibold tracking-tight">Upgrade to Pro</p>
                <p className="font-heading text-phosphor text-3xl font-bold tracking-tight">
                  {formatUsdFromCents(PEON_PRO_MONTHLY_CENTS)}
                  <span className="text-muted-foreground ml-0.5 text-xs font-medium">/mo</span>
                </p>
                <p className="text-muted-foreground text-[11px] leading-snug">per project</p>
              </div>

              <div className="bg-background/40 w-full rounded-md border border-phosphor/15 px-2 py-1.5">
                <p className="text-[11px] leading-snug font-medium">
                  {formatUsdFromCents(PEON_PRO_YEARLY_CENTS)}/yr
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {formatUsdFromCents(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS)}/mo
                  </span>
                </p>
              </div>

              <span className="text-phosphor inline-flex items-center gap-1 text-[11px] font-semibold">
                Get Pro
                <ArrowRight className="size-3.5 transition-transform group-hover/upgrade:translate-x-0.5" />
              </span>
            </div>
          )}
        </button>
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
