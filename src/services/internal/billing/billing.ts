import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { isBillingEnabled, serverEnv } from '@/lib/env';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  ValidationError,
} from '@/lib/errors';
import { getStripe } from '@/lib/stripe/client';
import {
  isBillingEntitled,
  isOverProjectLimit,
  periodPaidThroughQuantity,
} from '@/lib/billing/entitlement';
import {
  PEON_PRO_MONTHLY_CENTS,
  PEON_PRO_YEARLY_CENTS,
  yearlyDiscountPercent,
} from '@/lib/billing/pricing';
import {
  extractSubscriptionPromotion,
  mergePromotionFields,
  SUBSCRIPTION_DISCOUNT_EXPAND,
  subscriptionDiscountsNeedExpand,
} from '@/lib/billing/promotion';

export type BillingInterval = 'month' | 'year';

async function ensureSubscriptionDiscountsExpanded(
  stripeSub: Stripe.Subscription,
): Promise<Stripe.Subscription> {
  if (!subscriptionDiscountsNeedExpand(stripeSub)) return stripeSub;
  return getStripe().subscriptions.retrieve(stripeSub.id, {
    expand: [...SUBSCRIPTION_DISCOUNT_EXPAND],
  });
}

async function resolvePriceId(interval: BillingInterval): Promise<string> {
  const env = serverEnv();
  const lookup =
    interval === 'year' ? env.STRIPE_PRICE_LOOKUP_YEARLY : env.STRIPE_PRICE_LOOKUP_MONTHLY;
  const stripe = getStripe();
  const prices = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    throw new AppError(`Stripe price not found for lookup key "${lookup}"`, 500, 'STRIPE_PRICE_MISSING');
  }
  return price.id;
}

function periodEndFromSubscription(sub: Stripe.Subscription): Date | null {
  const item = sub.items.data[0];
  const end = item?.current_period_end ?? (sub as { current_period_end?: number }).current_period_end;
  return typeof end === 'number' ? new Date(end * 1000) : null;
}

function intervalFromSubscription(sub: Stripe.Subscription): BillingInterval | null {
  const interval = sub.items.data[0]?.price?.recurring?.interval;
  if (interval === 'month') return 'month';
  if (interval === 'year') return 'year';
  return null;
}


function nextPeriodPaidQuantity(opts: {
  previousPaid: number | null | undefined;
  previousQuantity: number;
  previousPeriodEnd: Date | null | undefined;
  newQuantity: number;
  newPeriodEnd: Date | null;
}): number | null {
  let paid = opts.previousPaid ?? null;
  if (paid != null) {
    const periodRolled =
      opts.previousPeriodEnd &&
      opts.newPeriodEnd &&
      opts.newPeriodEnd.getTime() > opts.previousPeriodEnd.getTime();
    if (periodRolled || opts.newQuantity >= paid) {
      paid = null;
    }
  }
  return paid;
}

export async function upsertSubscriptionFromStripe(
  workspaceId: string,
  stripeSubInput: Stripe.Subscription,
  customerId?: string | null,
) {
  const stripeSub = await ensureSubscriptionDiscountsExpanded(stripeSubInput);
  const item = stripeSub.items.data[0];
  const customer =
    customerId ??
    (typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id);
  const newQuantity = item?.quantity ?? 0;
  const newPeriodEnd = periodEndFromSubscription(stripeSub);

  const existing = await prisma.subscription.findUnique({ where: { workspaceId } });
  const periodPaidQuantity = nextPeriodPaidQuantity({
    previousPaid: existing?.periodPaidQuantity,
    previousQuantity: existing?.quantity ?? 0,
    previousPeriodEnd: existing?.currentPeriodEnd,
    newQuantity,
    newPeriodEnd,
  });
  const promotion = mergePromotionFields(
    existing
      ? {
          promotionCodeEver: existing.promotionCodeEver,
          promotionCodeAppliedAt: existing.promotionCodeAppliedAt,
        }
      : null,
    extractSubscriptionPromotion(stripeSub),
  );

  await prisma.subscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      stripeCustomerId: customer ?? undefined,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: item?.price?.id,
      stripeSubscriptionItemId: item?.id,
      status: stripeSub.status,
      quantity: newQuantity,
      periodPaidQuantity,
      interval: intervalFromSubscription(stripeSub),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      currentPeriodEnd: newPeriodEnd,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      ...promotion,
    },
    update: {
      stripeCustomerId: customer ?? undefined,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: item?.price?.id,
      stripeSubscriptionItemId: item?.id,
      status: stripeSub.status,
      quantity: newQuantity,
      periodPaidQuantity,
      interval: intervalFromSubscription(stripeSub),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      currentPeriodEnd: newPeriodEnd,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      ...promotion,
    },
  });

  if (stripeSub.status === 'active' || stripeSub.status === 'trialing' || stripeSub.status === 'past_due') {
    await ensureCustomerDefaultPaymentMethod(stripeSub).catch(() => undefined);
  }
}

async function workspaceProjectCount(workspaceId: string): Promise<number> {
  return prisma.project.count({ where: { workspaceId } });
}

/** Stripe Dashboard customer list label — includes workspace id for disambiguation. */
function stripeCustomerName(workspaceName: string, workspaceId: string): string {
  return `${workspaceName} (${workspaceId})`;
}

/**
 * Subscription-mode Checkout saves cards with allow_redisplay=limited by default,
 * so they won't show on the next subscribe. Promote attached cards to `always`
 * (workspace owners already manage these cards in Settings → Subscription).
 */
async function ensureCustomerCardsRedisplayable(customerId: string): Promise<void> {
  const stripe = getStripe();
  const methods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 50,
  });
  await Promise.all(
    methods.data
      .filter((pm) => pm.allow_redisplay !== 'always')
      .map((pm) =>
        stripe.paymentMethods.update(pm.id, { allow_redisplay: 'always' }).catch(() => {
          // Best-effort — Checkout can still fall back to allow_redisplay_filters.
        }),
      ),
  );
}

/** Keep Customer.invoice_settings.default_payment_method in sync with the subscription. */
async function ensureCustomerDefaultPaymentMethod(stripeSub: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id;
  const defaultPm = stripeSub.default_payment_method;
  if (!customerId || !defaultPm) return;

  const pmId = typeof defaultPm === 'string' ? defaultPm : defaultPm.id;
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return;

  const existing =
    typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id ?? null;

  if (existing === pmId) return;

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pmId },
  });
  await stripe.paymentMethods.update(pmId, { allow_redisplay: 'always' }).catch(() => undefined);
}

export const BillingService = {
  isEnabled() {
    return isBillingEnabled();
  },

  pricingCopy() {
    return {
      monthlyCents: PEON_PRO_MONTHLY_CENTS,
      yearlyCents: PEON_PRO_YEARLY_CENTS,
      yearlyDiscountPercent: yearlyDiscountPercent(),
    };
  },

  async getOrCreateCustomer(workspaceId: string) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { subscription: true, memberships: { where: { role: 'OWNER' }, include: { user: true } } },
    });
    if (!workspace) throw new NotFoundError('Workspace not found.');

    if (workspace.subscription?.stripeCustomerId) {
      return workspace.subscription.stripeCustomerId;
    }

    const owner = workspace.memberships[0]?.user;
    const stripe = getStripe();
    const customer = await stripe.customers.create({
      name: stripeCustomerName(workspace.name, workspaceId),
      email: owner?.email,
      description: `Peon workspace ${workspace.slug}`,
      metadata: { workspaceId, workspaceSlug: workspace.slug },
    });

    await prisma.subscription.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        stripeCustomerId: customer.id,
        status: 'inactive',
      },
      update: { stripeCustomerId: customer.id },
    });

    return customer.id;
  },

  async getLocalSubscription(workspaceId: string) {
    return prisma.subscription.findUnique({ where: { workspaceId } });
  },

  async getBillingSummary(workspaceId: string) {
    const billingOn = isBillingEnabled();
    const projectCount = await workspaceProjectCount(workspaceId);
    let sub = await prisma.subscription.findUnique({ where: { workspaceId } });

    if (billingOn && sub?.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
          expand: [...SUBSCRIPTION_DISCOUNT_EXPAND],
        });
        await upsertSubscriptionFromStripe(workspaceId, stripeSub);
        sub = await prisma.subscription.findUnique({ where: { workspaceId } });
      } catch {
        // Keep local snapshot if Stripe is temporarily unavailable.
      }
    }

    const entitled = billingOn ? isBillingEntitled(sub) : true;
    const seats = sub?.quantity ?? 0;
    const periodPaidQuantity = sub ? periodPaidThroughQuantity(sub) : 0;
    const overLimit = billingOn && sub ? isOverProjectLimit(sub, projectCount) : false;

    return {
      billingEnabled: billingOn,
      pricing: this.pricingCopy(),
      subscription: sub
        ? {
            status: sub.status,
            quantity: sub.quantity,
            periodPaidQuantity: sub.periodPaidQuantity,
            interval: sub.interval as BillingInterval | null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            canceledAt: sub.canceledAt?.toISOString() ?? null,
            stripePriceId: sub.stripePriceId,
          }
        : null,
      projectCount,
      seats,
      periodPaidQuantity: billingOn ? periodPaidQuantity : null,
      seatsAvailable: billingOn ? Math.max(0, seats - projectCount) : null,
      entitled,
      overProjectLimit: overLimit,
      canCreateProject: billingOn ? entitled && !overLimit && projectCount < seats : true,
    };
  },

  async createSubscriptionCheckoutElements(input: {
    workspaceId: string;
    interval: BillingInterval;
    quantity: number;
    returnUrl: string;
  }) {
    if (!isBillingEnabled()) {
      throw new AppError('Billing is not enabled on this instance.', 400, 'BILLING_DISABLED');
    }
    if (input.quantity < 1) throw new ValidationError('Quantity must be at least 1.');

    const existing = await prisma.subscription.findUnique({ where: { workspaceId: input.workspaceId } });
    if (existing && isBillingEntitled(existing) && existing.stripeSubscriptionId) {
      throw new ConflictError('Workspace already has an active subscription. Manage seats instead.');
    }

    const customerId = await this.getOrCreateCustomer(input.workspaceId);
    const priceId = await resolvePriceId(input.interval);
    const stripe = getStripe();

    // Keep customer name/email in sync for Payment Element / Link prefills.
    const workspace = await prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      include: {
        memberships: { where: { role: 'OWNER' }, include: { user: true }, take: 1 },
      },
    });
    const owner = workspace?.memberships[0]?.user;
    if (workspace && (owner?.email || workspace.name)) {
      await stripe.customers.update(customerId, {
        email: owner?.email ?? undefined,
        name: stripeCustomerName(workspace.name, input.workspaceId),
        description: `Peon workspace ${workspace.slug}`,
        metadata: { workspaceId: input.workspaceId, workspaceSlug: workspace.slug },
      });
    }

    // Existing cards from prior subscriptions are often allow_redisplay=limited;
    // promote + filter so Checkout Payment Element can list/select them.
    await ensureCustomerCardsRedisplayable(customerId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'elements',
      customer: customerId,
      // Card-only keeps the in-app form simple (avoids Link/Cash App/Amazon Pay noise).
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: input.quantity }],
      allow_promotion_codes: true,
      // Show saved cards + let the customer opt into redisplay on future checkouts.
      saved_payment_method_options: {
        allow_redisplay_filters: ['always', 'limited', 'unspecified'],
        payment_method_save: 'enabled',
        payment_method_remove: 'disabled',
      },
      return_url: input.returnUrl,
      client_reference_id: input.workspaceId,
      metadata: {
        workspaceId: input.workspaceId,
        interval: input.interval,
      },
      subscription_data: {
        metadata: { workspaceId: input.workspaceId },
      },
    });

    if (!session.client_secret) {
      throw new AppError('Stripe did not return a client secret.', 500, 'STRIPE_SESSION_ERROR');
    }

    return { clientSecret: session.client_secret, sessionId: session.id };
  },

  async getCheckoutSessionStatus(workspaceId: string, sessionId: string) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    if (session.metadata?.workspaceId && session.metadata.workspaceId !== workspaceId) {
      throw new NotFoundError('Checkout session not found.');
    }
    if (session.client_reference_id && session.client_reference_id !== workspaceId) {
      throw new NotFoundError('Checkout session not found.');
    }

    const sub =
      typeof session.subscription === 'object' && session.subscription
        ? session.subscription
        : null;
    if (session.status === 'complete' && sub) {
      await upsertSubscriptionFromStripe(workspaceId, sub as Stripe.Subscription);
    }

    return {
      status: session.status,
      paymentStatus: session.payment_status,
    };
  },

  async previewQuantityChange(workspaceId: string, quantity: number) {
    if (quantity < 1) throw new ValidationError('Quantity must be at least 1.');
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeSubscriptionId || !sub.stripeSubscriptionItemId || !isBillingEntitled(sub)) {
      throw new AppError('No active subscription to update.', 400, 'NO_SUBSCRIPTION');
    }

    const projectCount = await workspaceProjectCount(workspaceId);
    const currentQuantity = sub.quantity;
    if (quantity === currentQuantity) {
      return {
        currentQuantity,
        newQuantity: quantity,
        direction: 'unchanged' as const,
        currency: 'usd',
        immediateChargeCents: null,
        nextInvoiceCents: null,
        nextInvoiceAt: sub.currentPeriodEnd?.toISOString() ?? null,
        lines: [] as Array<{ description: string; amountCents: number }>,
        projectCount,
        overProjectLimit: projectCount > quantity,
      };
    }

    const stripe = getStripe();
    const increasing = quantity > currentQuantity;
    // Increases: invoice proration now. Decreases: no refund/credit — next invoice uses new qty.
    const preview = await stripe.invoices.createPreview({
      subscription: sub.stripeSubscriptionId,
      subscription_details: {
        items: [{ id: sub.stripeSubscriptionItemId, quantity }],
        proration_behavior: increasing ? 'always_invoice' : 'none',
      },
      preview_mode: 'next',
    });

    const lines = (preview.lines?.data ?? []).map((line) => ({
      description: line.description ?? 'Subscription',
      amountCents: line.amount,
    }));

    return {
      currentQuantity,
      newQuantity: quantity,
      direction: increasing ? ('increase' as const) : ('decrease' as const),
      currency: preview.currency,
      immediateChargeCents: increasing ? preview.amount_due : null,
      nextInvoiceCents: increasing ? null : preview.amount_due,
      nextInvoiceAt: preview.next_payment_attempt
        ? new Date(preview.next_payment_attempt * 1000).toISOString()
        : sub.currentPeriodEnd?.toISOString() ?? null,
      lines,
      projectCount,
      overProjectLimit: projectCount > quantity,
    };
  },

  async updateQuantity(workspaceId: string, quantity: number) {
    if (quantity < 1) throw new ValidationError('Quantity must be at least 1.');
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeSubscriptionId || !sub.stripeSubscriptionItemId || !isBillingEntitled(sub)) {
      throw new AppError('No active subscription to update.', 400, 'NO_SUBSCRIPTION');
    }

    const stripe = getStripe();
    const previousQuantity = sub.quantity;
    const increasing = quantity > previousQuantity;
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: sub.stripeSubscriptionItemId, quantity }],
      // Charge prorations immediately on adds; never credit/refund on removes.
      proration_behavior: increasing ? 'always_invoice' : 'none',
    });
    await upsertSubscriptionFromStripe(workspaceId, updated);

    if (!increasing && quantity < previousQuantity) {
      const paidThrough = Math.max(sub.periodPaidQuantity ?? previousQuantity, previousQuantity);
      await prisma.subscription.update({
        where: { workspaceId },
        data: { periodPaidQuantity: paidThrough },
      });
    } else if (increasing && quantity >= (sub.periodPaidQuantity ?? 0)) {
      await prisma.subscription.update({
        where: { workspaceId },
        data: { periodPaidQuantity: null },
      });
    }

    return this.getBillingSummary(workspaceId);
  },

  async previewIntervalChange(workspaceId: string, interval: BillingInterval) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeSubscriptionId || !sub.stripeSubscriptionItemId || !isBillingEntitled(sub)) {
      throw new AppError('No active subscription to update.', 400, 'NO_SUBSCRIPTION');
    }
    if (sub.interval === interval) {
      throw new ValidationError(`Already on the ${interval}ly plan.`);
    }

    const priceId = await resolvePriceId(interval);
    const stripe = getStripe();
    const preview = await stripe.invoices.createPreview({
      subscription: sub.stripeSubscriptionId,
      subscription_details: {
        items: [{ id: sub.stripeSubscriptionItemId, price: priceId }],
        proration_behavior: 'always_invoice',
      },
      preview_mode: 'next',
    });

    return {
      currentInterval: sub.interval as BillingInterval | null,
      newInterval: interval,
      currency: preview.currency,
      immediateChargeCents: preview.amount_due,
      nextInvoiceAt: preview.next_payment_attempt
        ? new Date(preview.next_payment_attempt * 1000).toISOString()
        : sub.currentPeriodEnd?.toISOString() ?? null,
      lines: (preview.lines?.data ?? []).map((line) => ({
        description: line.description ?? 'Subscription',
        amountCents: line.amount,
      })),
      quantity: sub.quantity,
    };
  },

  async changeInterval(workspaceId: string, interval: BillingInterval) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeSubscriptionId || !sub.stripeSubscriptionItemId || !isBillingEntitled(sub)) {
      throw new AppError('No active subscription to update.', 400, 'NO_SUBSCRIPTION');
    }
    if (sub.cancelAtPeriodEnd) {
      throw new ValidationError(
        'Resume your subscription before changing the billing interval.',
      );
    }
    if (sub.interval === interval) {
      throw new ValidationError(`Already on the ${interval}ly plan.`);
    }

    const priceId = await resolvePriceId(interval);
    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: sub.stripeSubscriptionItemId, price: priceId }],
      proration_behavior: 'always_invoice',
    });
    await upsertSubscriptionFromStripe(workspaceId, updated);
    return this.getBillingSummary(workspaceId);
  },

  async cancel(
    workspaceId: string,
    when: 'period_end' | 'immediately',
    reason: { code: string; detail?: string },
  ) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeSubscriptionId) {
      throw new AppError('No subscription to cancel.', 400, 'NO_SUBSCRIPTION');
    }

    const stripe = getStripe();
    const metadata = {
      cancel_reason: reason.code,
      cancel_reason_detail: (reason.detail ?? '').slice(0, 500),
      cancel_when: when,
      cancel_requested_at: new Date().toISOString(),
    };

    if (when === 'period_end') {
      const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
        metadata,
      });
      await upsertSubscriptionFromStripe(workspaceId, updated);
    } else {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { metadata });
      const canceled = await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      await upsertSubscriptionFromStripe(workspaceId, canceled);
    }
    return this.getBillingSummary(workspaceId);
  },

  async resume(workspaceId: string) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeSubscriptionId || !isBillingEntitled(sub)) {
      throw new AppError('No active subscription to resume.', 400, 'NO_SUBSCRIPTION');
    }
    if (!sub.cancelAtPeriodEnd) {
      throw new ValidationError('Subscription is not scheduled to cancel.');
    }

    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await upsertSubscriptionFromStripe(workspaceId, updated);
    return this.getBillingSummary(workspaceId);
  },

  async listInvoices(workspaceId: string) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeCustomerId) return [];

    const stripe = getStripe();
    const invoices = await stripe.invoices.list({
      customer: sub.stripeCustomerId,
      limit: 24,
    });

    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
    }));
  },

  async listPaymentMethods(workspaceId: string) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeCustomerId) return { defaultPaymentMethodId: null, methods: [] as const };

    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(sub.stripeCustomerId);
    if (customer.deleted) return { defaultPaymentMethodId: null, methods: [] as const };

    const defaultId =
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id ?? null;

    const pms = await stripe.paymentMethods.list({
      customer: sub.stripeCustomerId,
      type: 'card',
      limit: 20,
    });

    return {
      defaultPaymentMethodId: defaultId,
      methods: pms.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
      })),
    };
  },

  async setDefaultPaymentMethod(workspaceId: string, paymentMethodId: string) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeCustomerId) {
      throw new AppError('No Stripe customer for this workspace.', 400, 'NO_CUSTOMER');
    }
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== sub.stripeCustomerId) {
      throw new NotFoundError('Payment method not found for this workspace.');
    }
    await stripe.customers.update(sub.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    if (pm.allow_redisplay !== 'always') {
      await stripe.paymentMethods.update(paymentMethodId, { allow_redisplay: 'always' });
    }
    if (sub.stripeSubscriptionId && isBillingEntitled(sub)) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }
    return this.listPaymentMethods(workspaceId);
  },

  async assertCanCreateProject(workspaceId: string) {
    if (!isBillingEnabled()) return;
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    const projectCount = await workspaceProjectCount(workspaceId);
    if (!isBillingEntitled(sub)) {
      throw new PaymentRequiredError(
        'Peon Pro is required to create projects. Subscribe from Settings → Subscription.',
        'BILLING_REQUIRED',
      );
    }
    if (isOverProjectLimit(sub, projectCount)) {
      throw new PaymentRequiredError(
        'Your project count exceeds your plan. Delete projects or add capacity from Settings → Subscription.',
        'PROJECTS_OVER_LIMIT',
      );
    }
    if (projectCount >= (sub?.quantity ?? 0)) {
      throw new PaymentRequiredError(
        'All project slots are in use. Add projects from Settings → Subscription.',
        'SEATS_EXHAUSTED',
      );
    }
  },

  async assertProjectWritable(workspaceId: string) {
    if (!isBillingEnabled()) return;
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!isBillingEntitled(sub)) {
      throw new ForbiddenError(
        'Subscription inactive. You can view and delete projects and services, but deployments and other changes are blocked until you resubscribe.',
        'BILLING_READ_ONLY',
      );
    }
    const projectCount = await workspaceProjectCount(workspaceId);
    if (isOverProjectLimit(sub, projectCount)) {
      throw new ForbiddenError(
        'Project count exceeds your plan. Delete projects down to your billed quantity (or add capacity) before making changes or deploying.',
        'PROJECTS_OVER_LIMIT',
      );
    }
  },
};

export async function handleStripeWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
      if (!workspaceId || !session.subscription) break;
      const stripe = getStripe();
      const subId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const stripeSub = await stripe.subscriptions.retrieve(subId, {
        expand: [...SUBSCRIPTION_DISCOUNT_EXPAND],
      });
      await upsertSubscriptionFromStripe(workspaceId, stripeSub);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const workspaceId = stripeSub.metadata?.workspaceId;
      if (workspaceId) {
        await upsertSubscriptionFromStripe(workspaceId, stripeSub);
        break;
      }
      const customerId =
        typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id;
      if (!customerId) break;
      const local = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (local) await upsertSubscriptionFromStripe(local.workspaceId, stripeSub);
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subRef = (invoice as { subscription?: string | { id: string } | null }).subscription;
      if (!subRef) break;
      const subId = typeof subRef === 'string' ? subRef : subRef.id;
      const stripe = getStripe();
      const stripeSub = await stripe.subscriptions.retrieve(subId, {
        expand: [...SUBSCRIPTION_DISCOUNT_EXPAND],
      });
      const workspaceId = stripeSub.metadata?.workspaceId;
      if (workspaceId) {
        await upsertSubscriptionFromStripe(workspaceId, stripeSub);
        break;
      }
      const customerId =
        typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id;
      if (!customerId) break;
      const local = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (local) await upsertSubscriptionFromStripe(local.workspaceId, stripeSub);
      break;
    }
    default:
      break;
  }
}
