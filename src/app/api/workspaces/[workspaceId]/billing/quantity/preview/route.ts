import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireBillingManage } from '@/lib/auth/access';
import { BillingService } from '@/services/internal/billing/billing';
import { updateQuantitySchema } from '@/schemas/billing.schema';
import { ValidationError } from '@/lib/errors';

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: NextRequest, { params }: Ctx) => {
  const { workspaceId } = await params;
  await requireBillingManage(workspaceId);
  const raw = new URL(request.url).searchParams.get('quantity');
  const parsed = updateQuantitySchema.safeParse({ quantity: Number(raw) });
  if (!parsed.success) {
    throw new ValidationError('quantity must be an integer between 1 and 500.');
  }
  return ok(await BillingService.previewQuantityChange(workspaceId, parsed.data.quantity));
});
