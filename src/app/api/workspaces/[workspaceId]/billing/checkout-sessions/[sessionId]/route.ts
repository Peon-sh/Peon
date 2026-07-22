import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireBillingManage } from '@/lib/auth/access';
import { BillingService } from '@/services/internal/billing/billing';

type Ctx = { params: Promise<{ workspaceId: string; sessionId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId, sessionId } = await params;
  await requireBillingManage(workspaceId);
  return ok(await BillingService.getCheckoutSessionStatus(workspaceId, sessionId));
});
