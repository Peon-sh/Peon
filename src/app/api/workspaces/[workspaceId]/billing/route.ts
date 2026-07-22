import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireWorkspaceMember, requireBillingManage } from '@/lib/auth/access';
import { BillingService } from '@/services/internal/billing/billing';
import { serverEnv } from '@/lib/env';
import { checkoutElementsSchema } from '@/schemas/billing.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireWorkspaceMember(workspaceId);
  return ok(await BillingService.getBillingSummary(workspaceId));
});

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireBillingManage(workspaceId);
  const body = checkoutElementsSchema.parse(await request.json());
  const returnUrl =
    body.returnUrl ?? `${serverEnv().APP_URL}/settings/subscription`;

  return ok(
    await BillingService.createSubscriptionCheckoutElements({
      workspaceId,
      interval: body.interval,
      quantity: body.quantity,
      returnUrl,
    }),
  );
});
