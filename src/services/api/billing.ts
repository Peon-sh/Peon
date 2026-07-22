import { api, unwrap } from '@/lib/http/axios';

export type BillingInterval = 'month' | 'year';

export interface BillingSummary {
  billingEnabled: boolean;
  pricing: {
    monthlyCents: number;
    yearlyCents: number;
    yearlyDiscountPercent: number;
  };
  subscription: {
    status: string;
    quantity: number;
    periodPaidQuantity: number | null;
    interval: BillingInterval | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    canceledAt: string | null;
    stripePriceId: string | null;
  } | null;
  projectCount: number;
  seats: number;
  periodPaidQuantity: number | null;
  seatsAvailable: number | null;
  entitled: boolean;
  overProjectLimit: boolean;
  canCreateProject: boolean;
}

export function getBillingSummary(workspaceId: string) {
  return unwrap<BillingSummary>(api.get(`/workspaces/${workspaceId}/billing`));
}

export function createCheckoutElements(
  workspaceId: string,
  input: { interval: BillingInterval; quantity: number; returnUrl?: string },
) {
  return unwrap<{ clientSecret: string; sessionId: string }>(
    api.post(`/workspaces/${workspaceId}/billing`, input),
  );
}

export function getCheckoutSessionStatus(workspaceId: string, sessionId: string) {
  return unwrap<{ status: string | null; paymentStatus: string | null }>(
    api.get(`/workspaces/${workspaceId}/billing/checkout-sessions/${sessionId}`),
  );
}

export interface QuantityChangePreview {
  currentQuantity: number;
  newQuantity: number;
  direction: 'increase' | 'decrease' | 'unchanged';
  currency: string;
  /** Prorated amount charged now when increasing projects. */
  immediateChargeCents: number | null;
  /** Next invoice total when decreasing (no refund; billed at new quantity). */
  nextInvoiceCents: number | null;
  nextInvoiceAt: string | null;
  lines: Array<{ description: string; amountCents: number }>;
  projectCount: number;
  overProjectLimit: boolean;
}

export function previewBillingQuantity(workspaceId: string, quantity: number) {
  return unwrap<QuantityChangePreview>(
    api.get(`/workspaces/${workspaceId}/billing/quantity/preview`, {
      params: { quantity },
    }),
  );
}

export interface IntervalChangePreview {
  currentInterval: BillingInterval | null;
  newInterval: BillingInterval;
  currency: string;
  immediateChargeCents: number;
  nextInvoiceAt: string | null;
  quantity: number;
  lines: Array<{ description: string; amountCents: number }>;
}

export function previewBillingInterval(workspaceId: string, interval: BillingInterval) {
  return unwrap<IntervalChangePreview>(
    api.get(`/workspaces/${workspaceId}/billing/change-interval/preview`, {
      params: { interval },
    }),
  );
}

export function updateBillingQuantity(workspaceId: string, quantity: number) {
  return unwrap<BillingSummary>(
    api.post(`/workspaces/${workspaceId}/billing/quantity`, { quantity }),
  );
}

export function changeBillingInterval(workspaceId: string, interval: BillingInterval) {
  return unwrap<BillingSummary>(
    api.post(`/workspaces/${workspaceId}/billing/change-interval`, { interval }),
  );
}

export function cancelBilling(
  workspaceId: string,
  input: {
    when: 'period_end' | 'immediately';
    reason: string;
    reasonDetail?: string;
  },
) {
  return unwrap<BillingSummary>(api.post(`/workspaces/${workspaceId}/billing/cancel`, input));
}

export function resumeBilling(workspaceId: string) {
  return unwrap<BillingSummary>(api.post(`/workspaces/${workspaceId}/billing/resume`));
}

export function listBillingInvoices(workspaceId: string) {
  return unwrap<
    Array<{
      id: string;
      number: string | null;
      status: string | null;
      amountPaid: number;
      currency: string;
      created: number;
      hostedInvoiceUrl: string | null;
      invoicePdf: string | null;
    }>
  >(api.get(`/workspaces/${workspaceId}/billing/invoices`));
}

export function listBillingPaymentMethods(workspaceId: string) {
  return unwrap<{
    defaultPaymentMethodId: string | null;
    methods: Array<{
      id: string;
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
    }>;
  }>(api.get(`/workspaces/${workspaceId}/billing/payment-methods`));
}

export function setDefaultPaymentMethod(workspaceId: string, paymentMethodId: string) {
  return unwrap(api.post(`/workspaces/${workspaceId}/billing/payment-methods`, { paymentMethodId }));
}
