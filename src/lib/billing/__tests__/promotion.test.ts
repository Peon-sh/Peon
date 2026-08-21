import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import {
  extractSubscriptionPromotion,
  mergePromotionFields,
  subscriptionDiscountsNeedExpand,
} from '@/lib/billing/promotion';

function discount(partial: {
  promotionCode?: string | { code: string } | null;
  coupon?: string | { id: string } | null;
}): Stripe.Discount {
  return {
    id: 'di_test',
    object: 'discount',
    checkout_session: null,
    customer: 'cus_test',
    customer_account: null,
    end: null,
    invoice: null,
    invoice_item: null,
    promotion_code: partial.promotionCode ?? null,
    source: {
      type: 'coupon',
      coupon: partial.coupon ?? null,
    },
    start: 1_700_000_000,
    subscription: 'sub_test',
    subscription_item: null,
  } as Stripe.Discount;
}

describe('extractSubscriptionPromotion', () => {
  it('returns empty when there are no discounts', () => {
    expect(extractSubscriptionPromotion({ discounts: [] })).toEqual({
      promotionCode: null,
      stripeCouponId: null,
      hasActivePromotion: false,
    });
  });

  it('marks active when discounts are unexpanded ids', () => {
    expect(extractSubscriptionPromotion({ discounts: ['di_123'] })).toEqual({
      promotionCode: null,
      stripeCouponId: null,
      hasActivePromotion: true,
    });
    expect(subscriptionDiscountsNeedExpand({ discounts: ['di_123'] })).toBe(true);
  });

  it('reads expanded promotion code and coupon id', () => {
    expect(
      extractSubscriptionPromotion({
        discounts: [
          discount({
            promotionCode: { code: 'WELCOME50' },
            coupon: { id: 'coupon_welcome' },
          }),
        ],
      }),
    ).toEqual({
      promotionCode: 'WELCOME50',
      stripeCouponId: 'coupon_welcome',
      hasActivePromotion: true,
    });
  });

  it('ignores bare promotion_code ids without expand', () => {
    expect(
      extractSubscriptionPromotion({
        discounts: [discount({ promotionCode: 'promo_abc', coupon: 'coupon_x' })],
      }),
    ).toEqual({
      promotionCode: null,
      stripeCouponId: 'coupon_x',
      hasActivePromotion: true,
    });
  });
});

describe('mergePromotionFields', () => {
  it('sets sticky ever/appliedAt on first promo sighting', () => {
    const now = new Date('2026-08-21T12:00:00.000Z');
    expect(
      mergePromotionFields(
        null,
        {
          promotionCode: 'WELCOME50',
          stripeCouponId: 'coupon_welcome',
          hasActivePromotion: true,
        },
        now,
      ),
    ).toEqual({
      promotionCode: 'WELCOME50',
      stripeCouponId: 'coupon_welcome',
      hasActivePromotion: true,
      promotionCodeEver: 'WELCOME50',
      promotionCodeAppliedAt: now,
    });
  });

  it('keeps sticky fields after once-coupon expires', () => {
    const appliedAt = new Date('2026-08-01T00:00:00.000Z');
    expect(
      mergePromotionFields(
        {
          promotionCodeEver: 'WELCOME50',
          promotionCodeAppliedAt: appliedAt,
        },
        {
          promotionCode: null,
          stripeCouponId: null,
          hasActivePromotion: false,
        },
      ),
    ).toEqual({
      promotionCode: null,
      stripeCouponId: null,
      hasActivePromotion: false,
      promotionCodeEver: 'WELCOME50',
      promotionCodeAppliedAt: appliedAt,
    });
  });
});
