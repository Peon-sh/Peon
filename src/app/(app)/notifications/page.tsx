'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageContainer, Panel } from '@/components/app/page';
import { useAuthStore } from '@/store/auth';
import {
  listNotifications,
  upsertNotification,
  testNotification,
  type ChannelConfig,
  type NotificationChannel,
} from '@/services/api/notifications';
import { NOTIFICATION_EVENTS } from '@/schemas/notifications.schema';

const TABS_LIST_CLASS =
  'h-auto w-full justify-start gap-5 overflow-x-auto rounded-none border-b bg-transparent p-0';
const TABS_TRIGGER_CLASS =
  'rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 pb-2 text-[12.5px] shadow-none data-[state=active]:border-phosphor data-[state=active]:bg-transparent data-[state=active]:text-phosphor data-[state=active]:shadow-none';

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
      hint: 'Comma-separated. Peon sends mail via its own email service — no SMTP setup needed.',
    },
  ],
  DISCORD: [{ key: 'webhookUrl', label: 'Webhook URL', secret: true }],
  SLACK: [{ key: 'webhookUrl', label: 'Webhook URL', secret: true }],
  TELEGRAM: [
    { key: 'token', label: 'Bot token', secret: true },
    { key: 'chatId', label: 'Chat ID' },
  ],
  PUSHOVER: [
    { key: 'token', label: 'App token', secret: true },
    { key: 'user', label: 'User key', secret: true },
  ],
  WEBHOOK: [
    { key: 'url', label: 'URL', secret: true },
    { key: 'secret', label: 'Signing secret', secret: true },
  ],
};

export default function NotificationsPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', wsId],
    queryFn: () => listNotifications(wsId),
    enabled: !!wsId,
  });

  return (
    <PageContainer>
      {isLoading ? (
        <div className="bg-accent h-64 animate-pulse rounded-lg" />
      ) : (
        <Tabs defaultValue="EMAIL">
          <TabsList className={TABS_LIST_CLASS}>
            {CHANNELS.map((c) => (
              <TabsTrigger key={c} value={c} className={TABS_TRIGGER_CLASS}>
                {CHANNEL_LABELS[c]}
              </TabsTrigger>
            ))}
          </TabsList>
          {CHANNELS.map((c) => (
            <TabsContent key={c} value={c} className="pt-6">
              <ChannelForm
                workspaceId={wsId}
                channel={c}
                existing={data?.find((d) => d.channel === c)}
              />
            </TabsContent>
          ))}
        </Tabs>
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
    <Panel
      title={CHANNEL_LABELS[channel]}
      actions={<Switch checked={enabled} onCheckedChange={setEnabled} />}
      contentClassName="space-y-4 p-4"
      footer={
        <>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
          >
            Send test
          </Button>
        </>
      }
    >
      {FIELDS[channel].map((f) => (
        <div key={f.key} className="space-y-2">
          <Label htmlFor={`${channel}-${f.key}`}>{f.label}</Label>
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
          {f.hint ? <p className="text-muted-foreground text-[11.5px]">{f.hint}</p> : null}
        </div>
      ))}

      <div className="space-y-2">
        <Label>Events</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NOTIFICATION_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={!!events[ev]}
                onCheckedChange={(v) => setEvents((e) => ({ ...e, [ev]: !!v }))}
              />
              {EVENT_LABELS[ev]}
            </label>
          ))}
        </div>
      </div>
    </Panel>
  );
}
