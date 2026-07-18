import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { handleTokenDeployWebhook } from '@/services/internal/webhooks/token-deploy';

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public deploy webhook. Domain logic lives in
 * `services/internal/webhooks/token-deploy.ts`.
 */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  const rawBody = await req.text();
  return ok(await handleTokenDeployWebhook({ token, rawBody, req }));
});
