import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { ValidationError } from '@/lib/errors';
import { NotificationService } from '@/services/internal/notifications/notifications';
import { NOTIFICATION_CHANNELS } from '@/schemas/notifications.schema';
import type { NotificationChannelType } from '@/lib/prisma';

type Ctx = { params: Promise<{ workspaceId: string; channel: string }> };

export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { workspaceId, channel } = await params;
  await requireInfraAccess(workspaceId);
  const upper = channel.toUpperCase() as NotificationChannelType;
  if (!NOTIFICATION_CHANNELS.includes(upper)) {
    throw new ValidationError('Unknown notification channel.');
  }
  return ok(await NotificationService.test(workspaceId, upper));
});
