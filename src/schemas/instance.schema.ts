import { z } from 'zod';

export const updateInstanceSettingsSchema = z.object({
  instanceName: z.string().min(1).max(120).optional(),
  fqdn: z.string().max(255).nullable().optional(),
  isRegistrationEnabled: z.boolean().optional(),
  isApiEnabled: z.boolean().optional(),
  customDnsServers: z.string().max(500).optional(),
  publicPortMin: z.number().int().min(1).max(65535).optional(),
  publicPortMax: z.number().int().min(1).max(65535).optional(),
  instanceTimezone: z.string().min(1).max(80).optional(),
});

export const updateOauthSettingSchema = z.object({
  provider: z.string().min(1).max(40).default('google'),
  enabled: z.boolean().optional(),
  clientId: z.string().max(500).nullable().optional(),
  redirectUri: z.string().max(500).nullable().optional(),
});

export type UpdateInstanceSettingsInput = z.infer<typeof updateInstanceSettingsSchema>;
export type UpdateOauthSettingInput = z.infer<typeof updateOauthSettingSchema>;
