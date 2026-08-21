import type Stripe from 'stripe';

export type SubscriptionPromotionSnapshot = {
  /** Human-readable promo code when expanded (e.g. WELCOME50). */
  promotionCode: string | null;
  /** Stripe coupon id when present. */
  stripeCouponId: string | null;
  /** True when the subscription currently has at least one discount. */
  hasActivePromotion: boolean;
};

const DISCOUNT_EXPAND = [
  'discounts',
  'discounts.promotion_code',
  'discounts.source.coupon',
] as const;

export const SUBSCRIPTION_DISCOUNT_EXPAND = [...DISCOUNT_EXPAND];

function isDiscountObject(
  value: string | Stripe.Discount,
): value is Stripe.Discount {
  return typeof value === 'object' && value !== null && 'object' in value;
}

function couponIdFromDiscount(discount: Stripe.Discount): string | null {
  const coupon = discount.source?.coupon;
  if (!coupon) return null;
  if (typeof coupon === 'string') return coupon;
  return coupon.id ?? null;
}

function promotionCodeFromDiscount(discount: Stripe.Discount): string | null {
  const promo = discount.promotion_code;
  if (!promo) return null;
  if (typeof promo === 'string') return null;
  return promo.code?.trim() || null;
}

/**
 * Reads the first usable discount from a Stripe subscription (or invoice-like discounts list).
 * Prefer calling with `expand: SUBSCRIPTION_DISCOUNT_EXPAND` so promotion codes resolve.
 */
export function extractSubscriptionPromotion(source: {
  discounts?: Array<string | Stripe.Discount> | null;
}): SubscriptionPromotionSnapshot {
  const discounts = source.discounts ?? [];
  const expanded = discounts.filter(isDiscountObject);
  if (expanded.length === 0) {
    return {
      promotionCode: null,
      stripeCouponId: null,
      hasActivePromotion: discounts.length > 0,
    };
  }

  const first = expanded[0]!;
  return {
    promotionCode: promotionCodeFromDiscount(first),
    stripeCouponId: couponIdFromDiscount(first),
    hasActivePromotion: true,
  };
}

/** True when discounts exist but are still unexpanded id strings. */
export function subscriptionDiscountsNeedExpand(source: {
  discounts?: Array<string | Stripe.Discount> | null;
}): boolean {
  const discounts = source.discounts ?? [];
  return discounts.some((d) => typeof d === 'string');
}

/**
 * Merge a live Stripe promo snapshot into sticky local columns.
 * Current fields follow Stripe; ever/appliedAt only set on first sighting.
 */
export function mergePromotionFields(
  existing: {
    promotionCodeEver: string | null;
    promotionCodeAppliedAt: Date | null;
  } | null,
  live: SubscriptionPromotionSnapshot,
  now = new Date(),
): {
  promotionCode: string | null;
  stripeCouponId: string | null;
  hasActivePromotion: boolean;
  promotionCodeEver: string | null;
  promotionCodeAppliedAt: Date | null;
} {
  const nextEver =
    live.promotionCode ??
    existing?.promotionCodeEver ??
    null;
  const nextAppliedAt =
    existing?.promotionCodeAppliedAt ??
    (live.hasActivePromotion || live.promotionCode ? now : null);

  return {
    promotionCode: live.promotionCode,
    stripeCouponId: live.stripeCouponId,
    hasActivePromotion: live.hasActivePromotion,
    promotionCodeEver: nextEver,
    promotionCodeAppliedAt: nextAppliedAt,
  };
}
