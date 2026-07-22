import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireBillingManage } from '@/lib/auth/access';
import { BillingService } from '@/services/internal/billing/billing';
import { changeIntervalSchema } from '@/schemas/billing.schema';
import { ValidationError } from '@/lib/errors';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireBillingManage(workspaceId);
  const interval = new URL(request.url).searchParams.get('interval');
  const parsed = changeIntervalSchema.safeParse({ interval });
  if (!parsed.success) {
    throw new ValidationError('interval must be month or year.');
  }
  return ok(await BillingService.previewIntervalChange(workspaceId, parsed.data.interval));
});
