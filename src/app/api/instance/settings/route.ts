import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, route } from '@/lib/http/response';
import { requireInstanceOwner } from '@/lib/auth/instance-owner';
import { InstanceService } from '@/services/internal/instance/instance';
import {
  updateInstanceSettingsSchema,
  updateOauthSettingSchema,
} from '@/schemas/instance.schema';

const patchSchema = z.object({
  settings: updateInstanceSettingsSchema.optional(),
  oauth: updateOauthSettingSchema.optional(),
});

export const GET = route(async () => {
  await requireInstanceOwner();
  return ok(await InstanceService.getSettings());
});

export const PATCH = route(async (request: NextRequest) => {
  await requireInstanceOwner();
  const body = patchSchema.parse(await request.json());
  if (body.settings) await InstanceService.updateSettings(body.settings);
  if (body.oauth) await InstanceService.upsertOauth(body.oauth);
  return ok(await InstanceService.getSettings());
});
