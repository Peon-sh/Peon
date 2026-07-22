import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireBillingManage } from '@/lib/auth/access';
import { BillingService } from '@/services/internal/billing/billing';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const POST = route(async (_request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireBillingManage(workspaceId);
  return ok(await BillingService.resume(workspaceId));
});
