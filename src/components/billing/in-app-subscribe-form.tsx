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
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { FormField } from '@/components/app/page';
import { cn } from '@/lib/utils';

const stripePromise = publicEnv.stripePublishableKey
  ? loadStripe(publicEnv.stripePublishableKey)
  : null;

/** Stacked label-over-control layout: this form renders in modals and narrow panels. */
const STACKED_FIELD = 'lg:grid-cols-1 lg:gap-2';

const PAYMENT_ELEMENT_OPTIONS = {
  layout: 'tabs' as const,
  fields: {
    billingDetails: {
      name: 'auto' as const,
      email: 'never' as const,
      phone: 'auto' as const,
      address: 'auto' as const,
    },
  },
};

function PayForm({ onSuccess }: { onSuccess: () => void }) {
  const checkoutState = useCheckoutElements();
  const [submitting, setSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Checkout session can be ready before PaymentElement finishes mounting its iframe.
  // validateElements/confirm then surface Stripe's "You must have a mounted element."
  const [paymentElementReady, setPaymentElementReady] = useState(false);

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
    if (!paymentElementReady) {
      const message = 'Payment form is still loading. Please wait a moment and try again.';
      setError(message);
      toast.error(message);
      return;
    }

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
          <FormField label="Coupon code" htmlFor="promo-code" className={STACKED_FIELD}>
            {appliedPromo ? (
              <div className="bg-primary/5 border-primary/30 flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-base">
                <span>
                  Applied <span className="font-medium">{appliedPromo}</span>
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
          </FormField>

          <FormField
            label="Payment"
            className={STACKED_FIELD}
            description={
              checkout.savedPaymentMethods && checkout.savedPaymentMethods.length > 0
                ? 'Saved cards for this workspace are listed below. Choose one or add a new card.'
                : undefined
            }
          >
            <div className="border-input bg-card relative min-h-[140px] rounded-md border px-3 py-2">
              {!paymentElementReady && !error ? (
                <p className="text-muted-foreground absolute inset-0 flex items-center gap-2 px-3 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading card form…
                </p>
              ) : null}
              <PaymentElement
                options={PAYMENT_ELEMENT_OPTIONS}
                onReady={() => setPaymentElementReady(true)}
                onLoadError={(event) => {
                  setPaymentElementReady(false);
                  const message =
                    event.error.message ||
                    'Could not load the payment form. Check your connection and try again.';
                  setError(message);
                  toast.error(message);
                }}
              />
            </div>
          </FormField>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </ModalBody>
      <ModalFooter className="flex-col gap-3 sm:flex-col">
        <div className="flex w-full items-baseline justify-between text-base">
          <span className="text-muted-foreground">Due now</span>
          <span className="text-md font-semibold tabular-nums">{checkout.total.total.amount}</span>
        </div>
        <Button
          className="w-full"
          onClick={onPay}
          disabled={submitting || promoBusy || !paymentElementReady}
        >
          {submitting ? 'Processing…' : paymentElementReady ? 'Subscribe' : 'Loading…'}
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

  const userName = user?.name;

  const checkoutElementsOptions = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            defaultValues: userName
              ? { billingAddress: { name: userName, address: { country: 'US' } } }
              : undefined,
            elementsOptions: {
              savedPaymentMethod: {
                enableSave: 'auto' as const,
                enableRedisplay: 'auto' as const,
              },
              appearance: {
                theme: 'night' as const,
                variables: {
                  colorPrimary: '#7170FF',
                  borderRadius: '6px',
                },
              },
            },
          }
        : null,
    [clientSecret, userName],
  );

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
      <div className="border-success/30 bg-success/5 flex items-start gap-3 rounded-lg border px-4 py-3">
        <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" />
        <div>
          <p className="text-base font-medium">Plan purchased</p>
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setInterval('month')}
            className={cn(
              'rounded-md border p-3 text-left transition-colors',
              interval === 'month' ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary',
            )}
          >
            <div className="text-sm font-medium">Monthly</div>
            <div className="mt-1 text-lg font-semibold">
              {formatUsdFromCents(PEON_PRO_MONTHLY_CENTS)}
              <span className="text-muted-foreground text-sm font-normal"> / project / mo</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setInterval('year')}
            className={cn(
              'rounded-md border p-3 text-left transition-colors',
              interval === 'year' ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary',
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-medium">Yearly</span>
              <DiscountBadge percent={discount} size="sm" />
            </div>
            <div className="mt-1 text-lg font-semibold">
              {formatUsdFromCents(PEON_PRO_YEARLY_CENTS)}
              <span className="text-muted-foreground text-sm font-normal"> / project / yr</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {formatUsdFromCents(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS)}/mo effective
              <span className="mx-1">·</span>
              <span className="line-through">{formatUsdFromCents(PEON_PRO_MONTHLY_CENTS * 12)}</span>
              <span className="text-primary ml-1.5 font-medium">~{discount}% off</span>
            </p>
          </button>
        </div>

        <FormField
          label="Project seats"
          htmlFor="seat-qty"
          className={STACKED_FIELD}
          description={
            <>
              Total due today:{' '}
              <span className="text-foreground font-medium">{formatUsdFromCents(totalCents)}</span>
            </>
          }
        >
          <Input
            id="seat-qty"
            type="number"
            min={1}
            max={500}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </FormField>

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
          {checkoutElementsOptions ? (
            <CheckoutElementsProvider stripe={stripePromise} options={checkoutElementsOptions}>
              <PayForm onSuccess={finish} />
            </CheckoutElementsProvider>
          ) : null}
        </ModalContent>
      </Modal>
    </>
  );
}
