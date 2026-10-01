'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField, FormSection, PageContainer, PageHeader } from '@/components/app/page';
import { useAuthStore } from '@/store/auth';
import {
  listNotifications,
  upsertNotification,
  testNotification,
  type ChannelConfig,
  type NotificationChannel,
} from '@/services/api/notifications';
import { NOTIFICATION_EVENTS } from '@/schemas/notifications.schema';
import { cn } from '@/lib/utils';

const CHANNELS: NotificationChannel[] = [
  'EMAIL',
  'DISCORD',
  'SLACK',
  'TELEGRAM',
  'PUSHOVER',
  'WEBHOOK',
];

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  EMAIL: 'Email',
  DISCORD: 'Discord',
  SLACK: 'Slack',
  TELEGRAM: 'Telegram',
  PUSHOVER: 'Pushover',
  WEBHOOK: 'Webhook',
};

const EVENT_LABELS: Record<(typeof NOTIFICATION_EVENTS)[number], string> = {
  deployment_success: 'Deployment success',
  deployment_failure: 'Deployment failed',
  server_unreachable: 'Server unreachable',
  backup_failure: 'Backup failure',
};

interface FieldDef {
  key: string;
  label: string;
  secret?: boolean;
  hint?: string;
}

const FIELDS: Record<NotificationChannel, FieldDef[]> = {
  EMAIL: [
    {
      key: 'to',
      label: 'Recipient email(s)',
      hint: 'Comma-separated. Peon sends mail through its own email service, so no SMTP setup is needed.',
    },
  ],
  DISCORD: [
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      secret: true,
      hint: 'Paste the Incoming Webhook URL from Discord (Integrations → Webhooks). It should start with https://discord.com/api/webhooks/',
    },
  ],
  SLACK: [
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      secret: true,
      hint: 'Paste the Incoming Webhook URL from Slack. It should start with https://hooks.slack.com/',
    },
  ],
  TELEGRAM: [
    { key: 'token', label: 'Bot token', secret: true },
    { key: 'chatId', label: 'Chat ID' },
  ],
  PUSHOVER: [
    { key: 'token', label: 'App token', secret: true },
    { key: 'user', label: 'User key', secret: true },
  ],
  WEBHOOK: [
    {
      key: 'url',
      label: 'URL',
      secret: true,
      hint: 'HTTPS URL Peon should POST events to. Localhost and cloud-metadata addresses are blocked.',
    },
    { key: 'secret', label: 'Signing secret', secret: true },
  ],
};

export default function NotificationsPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;
  const [channel, setChannel] = useState<NotificationChannel>('EMAIL');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', wsId],
    queryFn: () => listNotifications(wsId),
    enabled: !!wsId,
  });

  return (
    <PageContainer>
      <PageHeader title="Notifications" description="Where deploy and health alerts go" />
      {isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <nav aria-label="Notification channels" className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                aria-current={channel === c ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-left text-base whitespace-nowrap transition-colors',
                  channel === c
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {CHANNEL_LABELS[c]}
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            <ChannelForm
              key={channel}
              workspaceId={wsId}
              channel={channel}
              existing={data?.find((d) => d.channel === channel)}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function ChannelForm({
  workspaceId,
  channel,
  existing,
}: {
  workspaceId: string;
  channel: NotificationChannel;
  existing?: ChannelConfig;
}) {
  const qc = useQueryClient();
  const initialCfg: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing?.config ?? {})) initialCfg[k] = String(v);

  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [config, setConfig] = useState<Record<string, string>>(initialCfg);
  const [events, setEvents] = useState<Record<string, boolean>>(
    (existing?.events as Record<string, boolean>) ?? {},
  );
  const [snapshot, setSnapshot] = useState(existing);

  if (snapshot !== existing) {
    setSnapshot(existing);
    setEnabled(existing?.enabled ?? false);
    const cfg: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing?.config ?? {})) cfg[k] = String(v);
    setConfig(cfg);
    setEvents((existing?.events as Record<string, boolean>) ?? {});
  }

  const saveMut = useMutation({
    mutationFn: () => {
      // Persist only the four supported event keys for this channel.
      const nextEvents: Record<string, boolean> = {};
      for (const ev of NOTIFICATION_EVENTS) {
        nextEvents[ev] = !!events[ev];
      }
      // Email: keep only recipient field (drop legacy SMTP keys on save).
      const nextConfig =
        channel === 'EMAIL'
          ? { to: config.to ?? '' }
          : Object.fromEntries(
              FIELDS[channel].map((f) => [f.key, config[f.key] ?? '']),
            );
      return upsertNotification(workspaceId, {
        channel,
        enabled,
        config: nextConfig,
        events: nextEvents,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications', workspaceId] });
      toast.success('Saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const testMut = useMutation({
    mutationFn: () => testNotification(workspaceId, channel),
    onSuccess: () => toast.success('Test sent'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <FormSection
      title={CHANNEL_LABELS[channel]}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
          >
            Send test
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Save
          </Button>
        </>
      }
    >
      <FormField label="Enabled" htmlFor={`${channel}-enabled`}>
        <Switch id={`${channel}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
      </FormField>

      {FIELDS[channel].map((f) => (
        <FormField key={f.key} label={f.label} htmlFor={`${channel}-${f.key}`} description={f.hint}>
          <Input
            id={`${channel}-${f.key}`}
            type={f.secret ? 'password' : 'text'}
            placeholder={
              f.secret && config[f.key] === '__MASKED__'
                ? '•••••• (unchanged)'
                : channel === 'EMAIL'
                  ? 'you@company.com, team@company.com'
                  : ''
            }
            value={config[f.key] === '__MASKED__' ? '' : (config[f.key] ?? '')}
            onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
          />
        </FormField>
      ))}

      <FormField label="Events" description="Which events send an alert on this channel.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NOTIFICATION_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-base">
              <Checkbox
                checked={!!events[ev]}
                onCheckedChange={(v) => setEvents((e) => ({ ...e, [ev]: !!v }))}
              />
              {EVENT_LABELS[ev]}
            </label>
          ))}
        </div>
      </FormField>
    </FormSection>
  );
}
