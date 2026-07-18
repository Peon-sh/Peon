import { z } from 'zod';

export const NOTIFICATION_CHANNELS = [
  'EMAIL',
  'DISCORD',
  'SLACK',
  'TELEGRAM',
  'PUSHOVER',
  'WEBHOOK',
] as const;

/** Events exposed in the UI and honored when dispatching notifications. */
export const NOTIFICATION_EVENTS = [
  'deployment_success',
  'deployment_failure',
  'server_unreachable',
  'backup_failure',
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

const eventsSchema = z.record(z.string(), z.boolean());

// Channel config is free-form key/value; secret parts are encrypted at the service layer.
const configSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const upsertChannelSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  enabled: z.boolean().default(false),
  config: configSchema.default({}),
  events: eventsSchema.default({}),
});

export type UpsertChannelInput = z.infer<typeof upsertChannelSchema>;
