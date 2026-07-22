import { z } from 'zod';

export const billingIntervalSchema = z.enum(['month', 'year']);

export const checkoutElementsSchema = z.object({
  interval: billingIntervalSchema,
  quantity: z.number().int().min(1).max(500).default(1),
  returnUrl: z.string().url().optional(),
});

export const updateQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(500),
});

export const changeIntervalSchema = z.object({
  interval: billingIntervalSchema,
});

export const cancelSubscriptionSchema = z.object({
  when: z.enum(['period_end', 'immediately']),
  reason: z.enum([
    'too_expensive',
    'missing_features',
    'switching_product',
    'temporary_pause',
    'not_using',
    'other',
  ]),
  reasonDetail: z.string().max(500).optional(),
});

export const CANCEL_REASON_OPTIONS = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'missing_features', label: 'Missing features I need' },
  { value: 'switching_product', label: 'Switching to another product' },
  { value: 'temporary_pause', label: 'Taking a break / temporary pause' },
  { value: 'not_using', label: 'Not using it enough' },
  { value: 'other', label: 'Other' },
] as const;

export type CancelSubscriptionReason = (typeof CANCEL_REASON_OPTIONS)[number]['value'];

export const setDefaultPaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1),
});
