import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/client';
import { serverEnv, isBillingEnabled } from '@/lib/env';
import { handleStripeWebhookEvent } from '@/services/internal/billing/billing';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: 'Billing disabled' }, { status: 400 });
  }

  const secret = serverEnv().STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await handleStripeWebhookEvent(event);
  return NextResponse.json({ received: true });
}
