import { api, unwrap } from '@/lib/http/axios';

export type NotificationChannel =
  | 'EMAIL'
  | 'DISCORD'
  | 'SLACK'
  | 'TELEGRAM'
  | 'PUSHOVER'
  | 'WEBHOOK';

export interface ChannelConfig {
  id: string;
  channel: NotificationChannel;
  enabled: boolean;
  config: Record<string, string | number | boolean>;
  events: Record<string, boolean>;
}

export interface UpsertChannelPayload {
  channel: NotificationChannel;
  enabled: boolean;
  config: Record<string, string | number | boolean>;
  events: Record<string, boolean>;
}

export function listNotifications(workspaceId: string) {
  return unwrap<ChannelConfig[]>(api.get(`/workspaces/${workspaceId}/notifications`));
}

export function upsertNotification(workspaceId: string, input: UpsertChannelPayload) {
  return unwrap<ChannelConfig>(api.put(`/workspaces/${workspaceId}/notifications`, input));
}

export function testNotification(workspaceId: string, channel: NotificationChannel) {
  return unwrap<{ sent: boolean }>(
    api.post(`/workspaces/${workspaceId}/notifications/${channel.toLowerCase()}/test`),
  );
}
