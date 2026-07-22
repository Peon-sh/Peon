import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireBillingManage } from '@/lib/auth/access';
import { BillingService } from '@/services/internal/billing/billing';
import { cancelSubscriptionSchema } from '@/schemas/billing.schema';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const POST = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireBillingManage(workspaceId);
  const body = cancelSubscriptionSchema.parse(await request.json());
  return ok(await BillingService.cancel(workspaceId, body.when, {
    code: body.reason,
    detail: body.reasonDetail,
  }));
});
