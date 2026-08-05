import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

let cached: Stripe | null = null;

/** Server-only Stripe SDK. Throws if billing is not configured. */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = serverEnv().STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  cached = new Stripe(key, {
    // ui_mode: 'elements' requires >= 2026-03-25.dahlia (not available on basil).
    apiVersion: '2026-07-29.dahlia',
    typescript: true,
  });
  return cached;
}

/** Clear cached client (tests). */
export function resetStripeClient(): void {
  cached = null;
}
