export type BillingSubscriptionLike = {
  status: string;
  quantity: number;
  periodPaidQuantity?: number | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date | string | null;
  canceledAt?: Date | string | null;
};

const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Workspace may create/use project seats when the Stripe subscription is
 * active (or past_due during dunning). cancel_at_period_end keeps access until
 * currentPeriodEnd.
 */
export function isBillingEntitled(sub: BillingSubscriptionLike | null | undefined): boolean {
  if (!sub) return false;
  if (!ENTITLED_STATUSES.has(sub.status)) return false;
  if (sub.cancelAtPeriodEnd) {
    const end = asDate(sub.currentPeriodEnd);
    if (end && end.getTime() < Date.now()) return false;
  }
  return true;
}

/**
 * After a mid-cycle decrease, Stripe `quantity` is the next-invoice count.
 * `periodPaidQuantity` is the higher count already paid for this period (no refund).
 * Returns that paid count while the period is still open; otherwise billed quantity.
 */
export function periodPaidThroughQuantity(
  sub: BillingSubscriptionLike | null | undefined,
): number {
  const billed = sub?.quantity ?? 0;
  const paid = sub?.periodPaidQuantity;
  if (paid == null || paid <= billed) return billed;
  const end = asDate(sub?.currentPeriodEnd);
  if (end && end.getTime() < Date.now()) return billed;
  return paid;
}

export function hasAvailableSeat(
  sub: BillingSubscriptionLike | null | undefined,
  projectCount: number,
): boolean {
  if (!isBillingEntitled(sub)) return false;
  // Creates are gated by next-invoice (billed) quantity, not the paid grace count.
  return projectCount < (sub?.quantity ?? 0);
}

/**
 * Live projects exceed the billed plan quantity — writes/deploys are blocked
 * until projects are deleted down (or quantity is increased).
 */
export function isOverProjectLimit(
  sub: BillingSubscriptionLike | null | undefined,
  projectCount: number,
): boolean {
  if (!isBillingEntitled(sub)) return false;
  return projectCount > (sub?.quantity ?? 0);
}
