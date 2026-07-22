/** Peon Pro list prices used for UI copy and discount math (cents). */
export const PEON_PRO_MONTHLY_CENTS = 300;
export const PEON_PRO_YEARLY_CENTS = 3000;

/** What yearly would cost if billed monthly ($3 × 12). */
export const PEON_PRO_YEARLY_IF_MONTHLY_CENTS = PEON_PRO_MONTHLY_CENTS * 12;

/** Yearly plan as an equivalent monthly rate ($30 ÷ 12 = $2.50). */
export const PEON_PRO_YEARLY_EFFECTIVE_MONTHLY_CENTS = Math.round(PEON_PRO_YEARLY_CENTS / 12);

/** Fractional discount for yearly vs paying monthly for a year (~0.1667). */
export function yearlyDiscountFraction(): number {
  return (
    (PEON_PRO_YEARLY_IF_MONTHLY_CENTS - PEON_PRO_YEARLY_CENTS) / PEON_PRO_YEARLY_IF_MONTHLY_CENTS
  );
}

/** Rounded percent for badges, e.g. 17. */
export function yearlyDiscountPercent(): number {
  return Math.round(yearlyDiscountFraction() * 100);
}

export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
