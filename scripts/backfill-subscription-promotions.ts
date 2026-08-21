/**
 * One-off: backfill Subscription promotion columns from Stripe.
 *
 * Usage (from peon-app root, with prod/staging .env):
 *   pnpm exec tsx scripts/backfill-subscription-promotions.ts
 *   pnpm exec tsx scripts/backfill-subscription-promotions.ts --dry-run
 */
import 'dotenv/config';

import type Stripe from 'stripe';

import { prisma } from '../src/lib/prisma';
import { getStripe } from '../src/lib/stripe/client';
import {
  extractSubscriptionPromotion,
  mergePromotionFields,
  SUBSCRIPTION_DISCOUNT_EXPAND,
} from '../src/lib/billing/promotion';

async function promotionFromInvoice(subscriptionId: string) {
  const stripe = getStripe();
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    limit: 5,
    expand: ['data.discounts', 'data.discounts.promotion_code', 'data.discounts.source.coupon'],
  });

  for (const invoice of invoices.data) {
    const discounts = (invoice.discounts ?? []) as Array<string | Stripe.Discount>;
    const snap = extractSubscriptionPromotion({ discounts });
    if (snap.promotionCode || snap.stripeCouponId || snap.hasActivePromotion) {
      return snap;
    }
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rows = await prisma.subscription.findMany({
    where: { stripeSubscriptionId: { not: null } },
    select: {
      id: true,
      workspaceId: true,
      stripeSubscriptionId: true,
      promotionCodeEver: true,
      promotionCodeAppliedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${rows.length} subscriptions with Stripe ids (dryRun=${dryRun})`);
  const stripe = getStripe();
  let updated = 0;
  let fromInvoice = 0;

  for (const row of rows) {
    const subId = row.stripeSubscriptionId!;
    try {
      const stripeSub = await stripe.subscriptions.retrieve(subId, {
        expand: [...SUBSCRIPTION_DISCOUNT_EXPAND],
      });
      let live = extractSubscriptionPromotion(stripeSub);
      if (!live.promotionCode && !live.stripeCouponId && !live.hasActivePromotion) {
        const invoiceSnap = await promotionFromInvoice(subId);
        if (invoiceSnap) {
          live = invoiceSnap;
          fromInvoice += 1;
        }
      }

      const merged = mergePromotionFields(
        {
          promotionCodeEver: row.promotionCodeEver,
          promotionCodeAppliedAt: row.promotionCodeAppliedAt,
        },
        live,
      );

      if (
        !merged.hasActivePromotion &&
        !merged.promotionCodeEver &&
        !merged.promotionCodeAppliedAt
      ) {
        continue;
      }

      console.log(
        `${row.workspaceId} ${subId} -> code=${merged.promotionCode ?? '-'} ever=${merged.promotionCodeEver ?? '-'} active=${merged.hasActivePromotion}`,
      );

      if (!dryRun) {
        await prisma.subscription.update({
          where: { id: row.id },
          data: merged,
        });
      }
      updated += 1;
    } catch (err) {
      console.error(`Failed ${subId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Done. wrote=${updated} fromInvoiceFallback=${fromInvoice}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
