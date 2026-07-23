'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, CreditCard, ExternalLink, Loader2, Receipt, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConfirmButton } from '@/components/app/confirm';
import { LocalDateTime } from '@/components/app/local-datetime';
import { Section } from '@/components/app/page';
import { formatLocalDateTime } from '@/lib/datetime';
import { currentWorkspace, useAuthStore } from '@/store/auth';
import {
  cancelBilling,
  changeBillingInterval,
  getBillingSummary,
  listBillingInvoices,
  listBillingPaymentMethods,
  previewBillingInterval,
  previewBillingQuantity,
  resumeBilling,
  setDefaultPaymentMethod,
  updateBillingQuantity,
} from '@/services/api/billing';
import { InAppSubscribeForm } from '@/components/billing/in-app-subscribe-form';
import { SeatChangePreview } from '@/components/billing/seat-change-preview';
import { DiscountBadge } from '@/components/billing/discount-badge';
import {
  CancelReasonPicker,
  useCancelReasonState,
} from '@/components/billing/cancel-reason-picker';
import {
  ChargePreviewBlock,
  intervalConfirmCopy,
  quantityConfirmCopy,
} from '@/components/billing/charge-preview-block';
import {
  formatUsdFromCents,
  PEON_PRO_MONTHLY_CENTS,
  PEON_PRO_YEARLY_CENTS,
  PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS,
  yearlyDiscountPercent,
} from '@/lib/billing/pricing';
import { publicEnv } from '@/lib/env';
import { cn } from '@/lib/utils';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function PlanStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="bg-secondary/40 rounded-md border px-3 py-2.5">
      <div className="text-muted-foreground text-[10px] font-medium tracking-[0.12em] uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      {hint ? <div className="text-muted-foreground mt-0.5 text-[11px]">{hint}</div> : null}
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  const { currentWorkspaceId } = useAuthStore();
  const workspace = currentWorkspace();
  const wsId = currentWorkspaceId ?? '';
  const canManage = workspace?.role === 'OWNER' || workspace?.role === 'BILLING_ADMIN';
  const qc = useQueryClient();
  const discount = yearlyDiscountPercent();

  const { data: billing, isLoading } = useQuery({
    queryKey: ['billing', wsId],
    queryFn: () => getBillingSummary(wsId),
    enabled: !!wsId,
  });

  const { data: invoices } = useQuery({
    queryKey: ['billing-invoices', wsId],
    queryFn: () => listBillingInvoices(wsId),
    enabled: !!wsId && canManage && !!billing?.subscription,
  });

  const { data: paymentMethods, refetch: refetchPms } = useQuery({
    queryKey: ['billing-pms', wsId],
    queryFn: () => listBillingPaymentMethods(wsId),
    enabled: !!wsId && canManage && !!billing?.subscription,
  });

  const [seatQty, setSeatQty] = useState(1);
  const debouncedSeatQty = useDebouncedValue(seatQty, 400);
  const [yearlyOpen, setYearlyOpen] = useState(false);
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [periodEndOpen, setPeriodEndOpen] = useState(false);
  const [immediateOpen, setImmediateOpen] = useState(false);
  const [primaryPmId, setPrimaryPmId] = useState<string | null>(null);
  const periodEndCancel = useCancelReasonState();
  const immediateCancel = useCancelReasonState();

  useEffect(() => {
    if (billing?.seats) setSeatQty(billing.seats);
  }, [billing?.seats]);

  const seatPreviewEnabled =
    !!wsId && canManage && !!billing?.entitled && debouncedSeatQty !== (billing?.seats ?? 0);

  const { data: seatPreview, isFetching: seatPreviewLoading } = useQuery({
    queryKey: ['billing-quantity-preview', wsId, debouncedSeatQty],
    queryFn: () => previewBillingQuantity(wsId, debouncedSeatQty),
    enabled: seatPreviewEnabled,
    staleTime: 15_000,
  });

  const { data: yearlyPreview, isFetching: yearlyPreviewLoading } = useQuery({
    queryKey: ['billing-interval-preview', wsId, 'year'],
    queryFn: () => previewBillingInterval(wsId, 'year'),
    enabled:
      !!wsId &&
      canManage &&
      !!billing?.entitled &&
      billing.subscription?.interval === 'month' &&
      !billing.subscription?.cancelAtPeriodEnd &&
      yearlyOpen,
    staleTime: 15_000,
  });

  const invalidateBilling = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['billing', wsId] }),
      qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
    ]);
  };

  const qtyMut = useMutation({
    mutationFn: () => updateBillingQuantity(wsId, seatQty),
    onSuccess: async () => {
      useAuthStore.getState().patchWorkspaceBilling(wsId, { quantity: seatQty });
      await qc.invalidateQueries({ queryKey: ['billing-quantity-preview', wsId] });
      await invalidateBilling();
      toast.success('Projects updated');
      setSeatsOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const yearlyMut = useMutation({
    mutationFn: () => changeBillingInterval(wsId, 'year'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['billing-interval-preview', wsId] });
      await invalidateBilling();
      toast.success('Upgraded to yearly');
      setYearlyOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: (input: {
      when: 'period_end' | 'immediately';
      reason: string;
      reasonDetail?: string;
    }) => cancelBilling(wsId, input),
    onSuccess: async (_data, vars) => {
      if (vars.when === 'immediately') {
        useAuthStore.getState().patchWorkspaceBilling(wsId, { status: 'canceled' });
      } else {
        useAuthStore.getState().patchWorkspaceBilling(wsId, { cancelAtPeriodEnd: true });
      }
      await invalidateBilling();
      toast.success('Subscription cancellation scheduled');
      periodEndCancel.reset();
      immediateCancel.reset();
      if (vars.when === 'period_end') setPeriodEndOpen(false);
      else setImmediateOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const resumeMut = useMutation({
    mutationFn: () => resumeBilling(wsId),
    onSuccess: async () => {
      useAuthStore.getState().patchWorkspaceBilling(wsId, { cancelAtPeriodEnd: false });
      await invalidateBilling();
      toast.success('Subscription resumed');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const defaultPmMut = useMutation({
    mutationFn: (id: string) => setDefaultPaymentMethod(wsId, id),
    onSuccess: async () => {
      await refetchPms();
      toast.success('Default payment method updated');
      setPrimaryPmId(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (!publicEnv.billingEnabled) {
    return (
      <Section title="Subscription">
        <p className="text-muted-foreground text-sm">
          Billing is disabled on this instance. Self-host remains free with unlimited projects.
        </p>
      </Section>
    );
  }

  if (isLoading || !billing) {
    return <div className="bg-accent h-40 animate-pulse rounded-lg" />;
  }

  const sub = billing.subscription;
  const entitled = billing.entitled;
  const seatConfirm = quantityConfirmCopy(seatPreview);
  const yearlyConfirm = intervalConfirmCopy(yearlyPreview, sub?.quantity ?? billing.seats);
  const cancelScheduled = !!sub?.cancelAtPeriodEnd;
  const showYearlyUpgrade = entitled && !!sub && canManage && sub.interval === 'month';

  return (
    <div className="space-y-6">
      {showYearlyUpgrade && (
        <div
          className={cn(
            'border-phosphor/40 from-phosphor/20 via-phosphor/5 to-secondary relative overflow-hidden rounded-xl border bg-gradient-to-br p-5',
            cancelScheduled && 'opacity-70',
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-phosphor inline-flex items-center gap-1.5 text-sm font-bold tracking-tight">
                  <Sparkles className="size-4" />
                  Upgrade to yearly
                </span>
                <DiscountBadge percent={discount} size="lg" />
              </div>
              <p className="text-foreground text-sm font-medium">
                {formatUsdFromCents(PEON_PRO_YEARLY_CENTS)}
                <span className="text-muted-foreground font-normal"> / project / year</span>
                <span className="text-muted-foreground mx-2">·</span>
                <span className="text-phosphor text-xs font-semibold">
                  {formatUsdFromCents(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS)}/mo effective
                </span>
                <span className="text-muted-foreground mx-2">·</span>
                <span className="text-muted-foreground line-through">
                  {formatUsdFromCents(PEON_PRO_MONTHLY_CENTS * 12)}
                </span>
                <span className="text-phosphor ml-1.5 text-xs font-semibold">
                  ~{discount}% off vs monthly
                </span>
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {cancelScheduled
                  ? 'Resume your subscription before upgrading to yearly.'
                  : 'Switch now — unused monthly time is credited, and the prorated balance is charged immediately.'}
              </p>
            </div>
            <ConfirmButton
              variant="default"
              size="lg"
              confirmVariant="default"
              className="bg-phosphor text-background hover:bg-phosphor/90 h-12 shrink-0 px-6 text-sm font-bold shadow-none"
              title="Upgrade to yearly?"
              confirmLabel={
                yearlyPreviewLoading
                  ? 'Calculating…'
                  : `Pay ${formatUsdFromCents(yearlyConfirm.amountCents)} now`
              }
              disabled={yearlyMut.isPending || cancelScheduled}
              loading={yearlyMut.isPending}
              confirmPending={yearlyMut.isPending}
              confirmDisabled={yearlyPreviewLoading || yearlyMut.isPending}
              open={yearlyOpen}
              onOpenChange={setYearlyOpen}
              description={
                <>
                  <p>
                    Lock in <DiscountBadge percent={discount} size="sm" className="align-middle" />{' '}
                    vs monthly.
                  </p>
                  <p className="text-muted-foreground">
                    ({formatUsdFromCents(PEON_PRO_MONTHLY_CENTS * 12)}/yr →{' '}
                    {formatUsdFromCents(PEON_PRO_YEARLY_CENTS)}/yr per project ·{' '}
                    {formatUsdFromCents(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS)}/mo effective).
                  </p>
                  {yearlyPreviewLoading ? (
                    <p className="inline-flex items-center gap-2 text-xs">
                      <Loader2 className="size-3.5 animate-spin" />
                      Calculating prorated charge…
                    </p>
                  ) : (
                    <ChargePreviewBlock
                      title={yearlyConfirm.title}
                      amountCents={yearlyConfirm.amountCents}
                      subtitle={yearlyConfirm.subtitle}
                      lines={yearlyConfirm.lines}
                    />
                  )}
                </>
              }
              onConfirm={() => yearlyMut.mutate()}
            >
              {yearlyMut.isPending ? 'Upgrading…' : 'Upgrade to yearly'}
              {!yearlyMut.isPending ? <ArrowRight className="size-4" /> : null}
            </ConfirmButton>
          </div>
        </div>
      )}

      <Card className="ring-border/60">
        <CardHeader className="border-b">
          <CardTitle className="font-heading text-base">Current plan</CardTitle>
          <CardDescription>
            {entitled && sub
              ? 'Manage your Peon Pro subscription, projects, and billing cycle.'
              : 'Subscribe to create projects and unlock workspace Cloud features.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!entitled || !sub ? (
            <div className="space-y-4 pt-1">
              <p className="text-muted-foreground text-sm">
                No active Peon Pro subscription. From {formatUsdFromCents(PEON_PRO_MONTHLY_CENTS)}
                /mo or {formatUsdFromCents(PEON_PRO_YEARLY_CENTS)}/yr —{' '}
                <DiscountBadge percent={discount} size="sm" className="align-middle" /> on yearly.
              </p>
              {canManage ? (
                <InAppSubscribeForm workspaceId={wsId} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Ask a workspace owner or billing admin to subscribe.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <PlanStat
                  label="Status"
                  value={
                    <span className="capitalize">{sub.status.replace('_', ' ')}</span>
                  }
                  hint={
                    cancelScheduled ? (
                      <span className="text-amber-500">Cancels at period end</span>
                    ) : null
                  }
                />
                <PlanStat
                  label="Plan"
                  value={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {sub.interval === 'year' ? 'Yearly Peon Pro' : 'Monthly Peon Pro'}
                      {sub.interval === 'year' ? (
                        <DiscountBadge percent={discount} size="sm" />
                      ) : null}
                    </span>
                  }
                  hint={
                    sub.interval === 'year'
                      ? `${formatUsdFromCents(PEON_PRO_YEARLY_CENTS)} / project / yr · ${formatUsdFromCents(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS)}/mo`
                      : `${formatUsdFromCents(PEON_PRO_MONTHLY_CENTS)} / project / mo`
                  }
                />
                <PlanStat
                  label="Projects"
                  value={`${billing.projectCount} / ${sub.quantity}`}
                  hint={
                    billing.periodPaidQuantity != null &&
                    billing.periodPaidQuantity > sub.quantity ? (
                      <span>
                        Paid for {billing.periodPaidQuantity} through period end · next invoice{' '}
                        {sub.quantity}
                      </span>
                    ) : (
                      `${Math.max(0, sub.quantity - billing.projectCount)} available`
                    )
                  }
                />
                {sub.currentPeriodEnd && (
                  <PlanStat
                    label={cancelScheduled ? 'Ends' : 'Renews'}
                    value={<LocalDateTime value={sub.currentPeriodEnd} style="date" />}
                  />
                )}
              </div>

              {cancelScheduled && (
                <div className="flex flex-col gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Cancellation scheduled. You keep full access until the period ends.
                  </p>
                  {canManage && (
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      confirmVariant="default"
                      className="shrink-0 border-amber-500/40 bg-background text-foreground hover:bg-amber-500/10"
                      title="Resume subscription?"
                      description="Cancel the scheduled cancellation. Your plan renews normally at the end of the current period."
                      confirmLabel="Resume"
                      disabled={resumeMut.isPending}
                      loading={resumeMut.isPending}
                      confirmPending={resumeMut.isPending}
                      onConfirm={() => resumeMut.mutate()}
                    >
                      {resumeMut.isPending ? 'Resuming…' : 'Resume subscription'}
                    </ConfirmButton>
                  )}
                </div>
              )}

              {billing.overProjectLimit && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  You have {billing.projectCount} projects but your plan covers {sub.quantity}.
                  Deletes still work; writes and deployments are locked until you delete down to{' '}
                  {sub.quantity} or add capacity
                  {billing.periodPaidQuantity != null &&
                  billing.periodPaidQuantity > sub.quantity
                    ? ` (you remain paid for ${billing.periodPaidQuantity} until the period ends).`
                    : '.'}
                </div>
              )}

              {canManage && !cancelScheduled && (
                <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div>
                    <p className="text-sm font-medium">Cancel subscription</p>
                    <p className="text-muted-foreground text-xs">
                      Choose period-end or immediate cancel. We’ll ask for a quick reason.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      confirmVariant="default"
                      title="Cancel at period end?"
                      confirmLabel="Confirm cancel"
                      disabled={cancelMut.isPending}
                      loading={cancelMut.isPending && periodEndOpen}
                      confirmPending={cancelMut.isPending && periodEndOpen}
                      confirmDisabled={!periodEndCancel.ready || cancelMut.isPending}
                      open={periodEndOpen}
                      onOpenChange={(next) => {
                        setPeriodEndOpen(next);
                        if (!next) periodEndCancel.reset();
                      }}
                      description={
                        <>
                          <p>
                            Access continues until{' '}
                            {sub.currentPeriodEnd
                              ? formatLocalDateTime(sub.currentPeriodEnd, 'date')
                              : 'the end of the billing period'}
                            . You won’t be charged again.
                          </p>
                          <CancelReasonPicker
                            reason={periodEndCancel.reason}
                            reasonDetail={periodEndCancel.reasonDetail}
                            onReasonChange={periodEndCancel.setReason}
                            onDetailChange={periodEndCancel.setReasonDetail}
                          />
                        </>
                      }
                      onConfirm={() => {
                        if (!periodEndCancel.reason) return;
                        cancelMut.mutate({
                          when: 'period_end',
                          reason: periodEndCancel.reason,
                          reasonDetail: periodEndCancel.reasonDetail || undefined,
                        });
                      }}
                    >
                      {cancelMut.isPending && periodEndOpen
                        ? 'Canceling…'
                        : 'Cancel at period end'}
                    </ConfirmButton>
                    <ConfirmButton
                      variant="destructive"
                      size="sm"
                      title="Cancel immediately?"
                      confirmLabel="Cancel now"
                      disabled={cancelMut.isPending}
                      loading={cancelMut.isPending && immediateOpen}
                      confirmPending={cancelMut.isPending && immediateOpen}
                      confirmDisabled={!immediateCancel.ready || cancelMut.isPending}
                      open={immediateOpen}
                      onOpenChange={(next) => {
                        setImmediateOpen(next);
                        if (!next) immediateCancel.reset();
                      }}
                      description={
                        <>
                          <p>
                            Project writes will be blocked right away. You can still read and
                            delete resources. This cannot be undone without resubscribing.
                          </p>
                          <CancelReasonPicker
                            reason={immediateCancel.reason}
                            reasonDetail={immediateCancel.reasonDetail}
                            onReasonChange={immediateCancel.setReason}
                            onDetailChange={immediateCancel.setReasonDetail}
                          />
                        </>
                      }
                      onConfirm={() => {
                        if (!immediateCancel.reason) return;
                        cancelMut.mutate({
                          when: 'immediately',
                          reason: immediateCancel.reason,
                          reasonDetail: immediateCancel.reasonDetail || undefined,
                        });
                      }}
                    >
                      {cancelMut.isPending && immediateOpen
                        ? 'Canceling…'
                        : 'Cancel immediately'}
                    </ConfirmButton>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {entitled && sub && canManage && (
        <>
          <Card className="ring-border/60">
            <CardHeader className="border-b">
              <CardTitle className="font-heading text-base">Projects</CardTitle>
              <CardDescription>
                How many projects this workspace can create. Decreases keep paid capacity until the
                period ends; the next invoice uses the new count. If you drop below your live project
                count, writes and deployments lock until you delete down.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="projects">Projects</Label>
                  <Input
                    id="projects"
                    type="number"
                    min={1}
                    max={500}
                    className="w-28"
                    value={seatQty}
                    onChange={(e) => setSeatQty(Math.max(1, Number(e.target.value) || 1))}
                    disabled={qtyMut.isPending}
                  />
                </div>
                <ConfirmButton
                  variant="default"
                  size="default"
                  confirmVariant="default"
                  title="Confirm project change?"
                  confirmLabel={
                    seatPreview?.direction === 'increase'
                      ? `Charge ${formatUsdFromCents(seatConfirm.amountCents)}`
                      : seatPreview?.direction === 'decrease'
                        ? 'Confirm decrease'
                        : 'Update projects'
                  }
                  disabled={qtyMut.isPending || seatQty === sub.quantity}
                  loading={qtyMut.isPending}
                  confirmPending={qtyMut.isPending}
                  confirmDisabled={
                    qtyMut.isPending ||
                    seatPreviewLoading ||
                    !seatPreview ||
                    seatPreview.direction === 'unchanged'
                  }
                  open={seatsOpen}
                  onOpenChange={setSeatsOpen}
                  description={
                    <>
                      <p>
                        Change from {sub.quantity} → {seatQty} projects
                        {seatQty < billing.projectCount
                          ? ` (${billing.projectCount} live — ops lock until you delete down).`
                          : '.'}
                      </p>
                      {seatPreviewLoading ? (
                        <p className="inline-flex items-center gap-2 text-xs">
                          <Loader2 className="size-3.5 animate-spin" />
                          Calculating…
                        </p>
                      ) : (
                        <ChargePreviewBlock
                          title={seatConfirm.title}
                          amountCents={seatConfirm.amountCents}
                          subtitle={seatConfirm.subtitle}
                          lines={seatConfirm.lines}
                        />
                      )}
                    </>
                  }
                  onConfirm={() => qtyMut.mutate()}
                >
                  {qtyMut.isPending ? 'Updating…' : 'Update projects'}
                </ConfirmButton>
              </div>
              <SeatChangePreview preview={seatPreview} isLoading={seatPreviewLoading} />
            </CardContent>
          </Card>

          <Card className="ring-border/60">
            <CardHeader className="border-b">
              <CardTitle className="font-heading text-base">Payment methods</CardTitle>
              <CardDescription>Cards on file for this workspace subscription.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {!paymentMethods?.methods.length ? (
                <p className="text-muted-foreground text-sm">No cards on file yet.</p>
              ) : (
                <ul className="space-y-2">
                  {paymentMethods.methods.map((pm) => {
                    const isDefault = pm.id === paymentMethods.defaultPaymentMethodId;
                    const pendingThis = defaultPmMut.isPending && primaryPmId === pm.id;
                    return (
                      <li
                        key={pm.id}
                        className="bg-secondary/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="bg-background text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
                            <CreditCard className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {(pm.brand ?? 'card').toUpperCase()} ···· {pm.last4}
                            </div>
                            <div className="text-muted-foreground text-[11px]">
                              {pm.expMonth && pm.expYear
                                ? `Expires ${pm.expMonth}/${pm.expYear}`
                                : 'Expiration unknown'}
                              {isDefault ? ' · Primary' : ''}
                            </div>
                          </div>
                        </div>
                        {!isDefault && (
                          <ConfirmButton
                            variant="ghost"
                            size="sm"
                            confirmVariant="default"
                            title="Make this card primary?"
                            description="Future invoices will charge this payment method."
                            confirmLabel="Make primary"
                            disabled={defaultPmMut.isPending}
                            loading={pendingThis}
                            confirmPending={pendingThis}
                            onConfirm={() => {
                              setPrimaryPmId(pm.id);
                              defaultPmMut.mutate(pm.id);
                            }}
                          >
                            {pendingThis ? 'Updating…' : 'Make primary'}
                          </ConfirmButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="ring-border/60">
            <CardHeader className="border-b">
              <CardTitle className="font-heading text-base">Invoices</CardTitle>
              <CardDescription>Recent charges for this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {!invoices?.length ? (
                <p className="text-muted-foreground text-sm">No invoices yet.</p>
              ) : (
                <ul className="space-y-2">
                  {invoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="bg-secondary/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="bg-background text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
                          <Receipt className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{inv.number ?? inv.id}</div>
                          <div className="text-muted-foreground text-[11px]">
                            <span className="capitalize">{inv.status ?? 'unknown'}</span>
                            {' · '}
                            {formatUsdFromCents(inv.amountPaid)} {inv.currency.toUpperCase()}
                            {' · '}
                            <LocalDateTime value={inv.created * 1000} style="date" />
                          </div>
                        </div>
                      </div>
                      {inv.hostedInvoiceUrl && (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            'text-phosphor inline-flex shrink-0 items-center gap-1 text-xs hover:underline',
                          )}
                        >
                          View <ExternalLink className="size-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            {invoices && invoices.length > 0 && (
              <CardFooter className="text-muted-foreground border-t text-[11px]">
                Invoices open in Stripe’s hosted page.
              </CardFooter>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
