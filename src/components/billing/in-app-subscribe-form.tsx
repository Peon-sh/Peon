'use client';

import { useCallback, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { publicEnv } from '@/lib/env';
import { useAuthStore } from '@/store/auth';
import {
  createCheckoutElements,
  getCheckoutSessionStatus,
  type BillingInterval,
} from '@/services/api/billing';
import {
  formatUsdFromCents,
  PEON_PRO_MONTHLY_CENTS,
  PEON_PRO_YEARLY_CENTS,
  PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS,
  yearlyDiscountPercent,
} from '@/lib/billing/pricing';
import { DiscountBadge } from '@/components/billing/discount-badge';
import { cn } from '@/lib/utils';

const stripePromise = publicEnv.stripePublishableKey
  ? loadStripe(publicEnv.stripePublishableKey)
  : null;

function PayForm({ onSuccess }: { onSuccess: () => void }) {
  const checkoutState = useCheckoutElements();
  const [submitting, setSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (checkoutState.type === 'loading') {
    return (
      <ModalBody>
        <p className="text-muted-foreground text-sm">Loading payment form…</p>
      </ModalBody>
    );
  }
  if (checkoutState.type === 'error') {
    return (
      <ModalBody>
        <p className="text-destructive text-sm">{checkoutState.error.message}</p>
      </ModalBody>
    );
  }

  const checkout = checkoutState.checkout;
  const appliedPromo =
    checkout.discountAmounts?.find((d) => d.promotionCode)?.promotionCode ??
    checkout.discountAmounts?.[0]?.displayName ??
    null;

  const onApplyPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    setPromoBusy(true);
    setError(null);
    try {
      const result = await checkout.applyPromotionCode(code);
      if (result.type === 'error') {
        const message = result.error.message || 'Invalid coupon code';
        setError(message);
        toast.error(message);
        return;
      }
      setPromoCode('');
      toast.success('Coupon applied');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not apply coupon';
      setError(message);
      toast.error(message);
    } finally {
      setPromoBusy(false);
    }
  };

  const onRemovePromo = async () => {
    setPromoBusy(true);
    setError(null);
    try {
      const result = await checkout.removePromotionCode();
      if (result.type === 'error') {
        const message = result.error.message || 'Could not remove coupon';
        setError(message);
        toast.error(message);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not remove coupon';
      setError(message);
      toast.error(message);
    } finally {
      setPromoBusy(false);
    }
  };

  const onPay = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const validated = await checkout.validateElements();
      if (validated.type === 'error') {
        const message =
          validated.error.message ||
          validated.error.validation_errors?.[0]?.message ||
          'Please complete all required payment fields.';
        setError(message);
        toast.error(message);
        return;
      }

      // Stay in-app for card payments; only leave when the bank requires a redirect (e.g. 3DS).
      // Do not pass email/returnUrl/billingAddress — session + Payment Element already own them.
      const result = await checkout.confirm({
        redirect: 'if_required',
      });
      if (result && typeof result === 'object' && 'type' in result && result.type === 'error') {
        const err = result as { error?: { message?: string } };
        const message = err.error?.message ?? 'Payment failed';
        setError(message);
        toast.error(message);
        return;
      }
      onSuccess();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Payment failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModalBody>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="promo-code">Coupon code</Label>
            {appliedPromo ? (
              <div className="bg-phosphor/10 border-phosphor/30 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>
                  Applied <span className="font-semibold">{appliedPromo}</span>
                  {checkout.total.discount.amount !== '0' &&
                  checkout.total.discount.minorUnitsAmount !== 0 ? (
                    <span className="text-muted-foreground">
                      {' '}
                      (−{checkout.total.discount.amount})
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={promoBusy || submitting}
                  onClick={onRemovePromo}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="promo-code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Enter code"
                  disabled={promoBusy || submitting}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void onApplyPromo();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={promoBusy || submitting || !promoCode.trim()}
                  onClick={onApplyPromo}
                >
                  {promoBusy ? <Loader2 className="size-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
            )}
          </div>

          <PaymentElement
            options={{
              layout: 'tabs',
              fields: {
                billingDetails: {
                  name: 'auto',
                  email: 'never',
                  phone: 'never',
                  address: 'auto',
                },
              },
            }}
          />
          {checkout.savedPaymentMethods && checkout.savedPaymentMethods.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              Saved cards for this workspace are listed above. Choose one or add a new card.
            </p>
          ) : null}
          {error ? (
            <p className="text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
        </div>
      </ModalBody>
      <ModalFooter className="flex-col gap-3 sm:flex-col">
        <div className="flex w-full items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Due now</span>
          <span className="font-heading text-base font-bold">{checkout.total.total.amount}</span>
        </div>
        <Button
          className="w-full"
          onClick={onPay}
          disabled={submitting || promoBusy}
        >
          {submitting ? 'Processing…' : 'Subscribe'}
        </Button>
      </ModalFooter>
    </>
  );
}

export function InAppSubscribeForm({
  workspaceId,
  onSuccess,
  defaultQuantity = 1,
  returnPath = '/settings/subscription',
}: {
  workspaceId: string;
  onSuccess?: () => void;
  defaultQuantity?: number;
  returnPath?: string;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [interval, setInterval] = useState<BillingInterval>('year');
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);

  const discount = yearlyDiscountPercent();
  const unitCents = interval === 'year' ? PEON_PRO_YEARLY_CENTS : PEON_PRO_MONTHLY_CENTS;
  const totalCents = unitCents * quantity;
  const paymentOpen = !!clientSecret && !purchased;

  const returnUrl = useMemo(() => {
    if (typeof window === 'undefined') return publicEnv.appUrl + returnPath;
    return `${window.location.origin}${returnPath}`;
  }, [returnPath]);

  const startMut = useMutation({
    mutationFn: () =>
      createCheckoutElements(workspaceId, { interval, quantity, returnUrl }),
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setSessionId(data.sessionId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to start checkout'),
  });

  const closePayment = useCallback((open: boolean) => {
    if (!open) {
      setClientSecret(null);
      setSessionId(null);
    }
  }, []);

  const finish = useCallback(async () => {
    setPurchased(true);
    setClientSecret(null);
    toast.success('Peon Pro purchased');
    if (sessionId) {
      try {
        await getCheckoutSessionStatus(workspaceId, sessionId);
      } catch {
        // webhook may still sync
      }
    }
    useAuthStore.getState().patchWorkspaceBilling(workspaceId, {
      enabled: true,
      status: 'active',
      quantity,
      projectCount: quantity,
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['billing', workspaceId] }),
      qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
    ]);
    onSuccess?.();
  }, [sessionId, workspaceId, quantity, qc, onSuccess]);

  if (!publicEnv.billingEnabled || !stripePromise) {
    return (
      <p className="text-muted-foreground text-sm">
        Billing is not configured on this instance (self-host remains free).
      </p>
    );
  }

  if (purchased) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-phosphor/40 bg-phosphor/10 px-4 py-3">
        <CheckCircle2 className="text-phosphor mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">Plan purchased</p>
          <p className="text-muted-foreground text-sm">
            Your workspace is on Peon Pro with {quantity} project seat
            {quantity === 1 ? '' : 's'}. You can manage seats anytime in subscription settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setInterval('month')}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              interval === 'month' ? 'border-phosphor bg-secondary' : 'border-border hover:bg-accent',
            )}
          >
            <div className="text-xs font-semibold tracking-wide uppercase">Monthly</div>
            <div className="font-heading mt-1 text-lg font-bold">
              {formatUsdFromCents(PEON_PRO_MONTHLY_CENTS)}
              <span className="text-muted-foreground text-xs font-normal"> / project / mo</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setInterval('year')}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              interval === 'year'
                ? 'border-phosphor bg-phosphor/10 ring-phosphor/30 ring-1'
                : 'border-border hover:border-phosphor/40 hover:bg-accent',
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold tracking-wide uppercase">Yearly</span>
              <DiscountBadge percent={discount} size="sm" />
            </div>
            <div className="font-heading mt-1 text-lg font-bold">
              {formatUsdFromCents(PEON_PRO_YEARLY_CENTS)}
              <span className="text-muted-foreground text-xs font-normal"> / project / yr</span>
            </div>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {formatUsdFromCents(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS)}/mo effective
              <span className="mx-1">·</span>
              <span className="line-through">{formatUsdFromCents(PEON_PRO_MONTHLY_CENTS * 12)}</span>
              <span className="text-phosphor ml-1.5 font-semibold">~{discount}% off</span>
            </p>
          </button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seat-qty">Project seats</Label>
          <Input
            id="seat-qty"
            type="number"
            min={1}
            max={500}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
          <p className="text-muted-foreground text-xs">
            Total due today:{' '}
            <strong className="text-foreground">{formatUsdFromCents(totalCents)}</strong>
          </p>
        </div>

        <Button className="w-full" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
          {startMut.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Preparing…
            </>
          ) : (
            'Continue to payment'
          )}
        </Button>
      </div>

      <Modal open={paymentOpen} onOpenChange={closePayment}>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>Complete payment</ModalTitle>
            <ModalDescription>
              {interval === 'year' ? 'Yearly' : 'Monthly'} Peon Pro · {quantity} project
              {quantity === 1 ? '' : 's'}
            </ModalDescription>
          </ModalHeader>
          {clientSecret ? (
            <CheckoutElementsProvider
              stripe={stripePromise}
              options={{
                clientSecret,
                defaultValues: user?.name
                  ? { billingAddress: { name: user.name, address: { country: 'US' } } }
                  : undefined,
                elementsOptions: {
                  savedPaymentMethod: {
                    enableSave: 'auto',
                    enableRedisplay: 'auto',
                  },
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#a3e635',
                      borderRadius: '6px',
                    },
                  },
                },
              }}
            >
              <PayForm onSuccess={finish} />
            </CheckoutElementsProvider>
          ) : null}
        </ModalContent>
      </Modal>
    </>
  );
}
