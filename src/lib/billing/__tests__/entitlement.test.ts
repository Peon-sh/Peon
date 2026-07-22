import { describe, expect, it } from 'vitest';
import {
  hasAvailableSeat,
  isBillingEntitled,
  isOverProjectLimit,
  periodPaidThroughQuantity,
} from '@/lib/billing/entitlement';
import {
  PEON_PRO_MONTHLY_CENTS,
  PEON_PRO_YEARLY_CENTS,
  PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS,
  PEON_PRO_YEARLY_IF_MONTHLY_CENTS,
  yearlyDiscountPercent,
} from '@/lib/billing/pricing';

describe('billing pricing', () => {
  it('computes yearly discount vs monthly×12', () => {
    expect(PEON_PRO_MONTHLY_CENTS).toBe(300);
    expect(PEON_PRO_YEARLY_CENTS).toBe(3000);
    expect(PEON_PRO_YEARLY_IF_MONTHLY_CENTS).toBe(3600);
    expect(PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS).toBe(250);
    expect(yearlyDiscountPercent()).toBe(17);
  });
});

describe('billing entitlement', () => {
  it('treats active subscription as entitled', () => {
    expect(
      isBillingEntitled({ status: 'active', quantity: 2, cancelAtPeriodEnd: false }),
    ).toBe(true);
  });

  it('treats past_due as entitled during dunning', () => {
    expect(isBillingEntitled({ status: 'past_due', quantity: 1 })).toBe(true);
  });

  it('denies canceled / inactive', () => {
    expect(isBillingEntitled({ status: 'canceled', quantity: 1 })).toBe(false);
    expect(isBillingEntitled({ status: 'inactive', quantity: 1 })).toBe(false);
    expect(isBillingEntitled(null)).toBe(false);
  });

  it('keeps access until period end when cancel_at_period_end', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      isBillingEntitled({
        status: 'active',
        quantity: 1,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: future,
      }),
    ).toBe(true);
    expect(
      isBillingEntitled({
        status: 'active',
        quantity: 1,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: past,
      }),
    ).toBe(false);
  });

  it('checks seat availability against billed quantity', () => {
    const sub = { status: 'active', quantity: 2 };
    expect(hasAvailableSeat(sub, 0)).toBe(true);
    expect(hasAvailableSeat(sub, 1)).toBe(true);
    expect(hasAvailableSeat(sub, 2)).toBe(false);
    expect(hasAvailableSeat({ status: 'inactive', quantity: 5 }, 0)).toBe(false);
  });

  it('keeps period-paid quantity until period end after decrease', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const sub = {
      status: 'active',
      quantity: 1,
      periodPaidQuantity: 4,
      currentPeriodEnd: future,
    };
    expect(periodPaidThroughQuantity(sub)).toBe(4);
    expect(hasAvailableSeat(sub, 1)).toBe(false);
    expect(isOverProjectLimit(sub, 3)).toBe(true);
    expect(isOverProjectLimit(sub, 1)).toBe(false);
    expect(
      periodPaidThroughQuantity({
        ...sub,
        currentPeriodEnd: past,
      }),
    ).toBe(1);
  });
});
