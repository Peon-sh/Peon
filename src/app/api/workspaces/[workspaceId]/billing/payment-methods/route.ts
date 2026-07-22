import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireBillingManage } from '@/lib/auth/access';
import { BillingService } from '@/services/internal/billing/billing';
import { setDefaultPaymentMethodSchema } from '@/schemas/billing.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireBillingManage(workspaceId);
  return ok(await BillingService.listPaymentMethods(workspaceId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireBillingManage(workspaceId);
  const body = setDefaultPaymentMethodSchema.parse(await request.json());
  return ok(await BillingService.setDefaultPaymentMethod(workspaceId, body.paymentMethodId));
});
