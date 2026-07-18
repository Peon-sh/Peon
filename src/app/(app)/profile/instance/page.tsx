'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageContainer, Panel, Section } from '@/components/app/page';
import { useAuthStore } from '@/store/auth';
import {
  getInstanceSettings,
  updateInstanceSettings,
  type InstanceSettings,
} from '@/services/api/instance';

export default function InstanceSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const isOwner = user?.isInstanceOwner === true;

  const { data, isPending } = useQuery({
    queryKey: ['instance-settings'],
    queryFn: getInstanceSettings,
    enabled: isOwner,
  });

  const [settings, setSettings] = useState<Partial<InstanceSettings>>({});
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthClientId, setOauthClientId] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!data) {
      setHydrated(false);
      return;
    }
    setSettings(data.settings);
    const google = data.oauth.find((o) => o.provider === 'google');
    setOauthEnabled(google?.enabled ?? false);
    setOauthClientId(google?.clientId ?? '');
    setHydrated(true);
  }, [data]);

  const set = <K extends keyof InstanceSettings>(k: K, v: InstanceSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () =>
      updateInstanceSettings({
        settings: {
          instanceName: settings.instanceName,
          fqdn: settings.fqdn ?? null,
          isRegistrationEnabled: settings.isRegistrationEnabled,
          isApiEnabled: settings.isApiEnabled,
          customDnsServers: settings.customDnsServers,
          publicPortMin: settings.publicPortMin,
          publicPortMax: settings.publicPortMax,
          instanceTimezone: settings.instanceTimezone,
        },
        oauth: {
          provider: 'google',
          enabled: oauthEnabled,
          clientId: oauthClientId || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['instance-settings'] });
      toast.success('Instance settings saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (!isOwner) {
    return (
      <PageContainer>
        <p className="text-muted-foreground text-sm">
          Only the Peon instance owner can view global instance settings.
        </p>
      </PageContainer>
    );
  }

  if (isPending || !data || !hydrated) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="bg-accent h-80 animate-pulse rounded-lg" />
          <div className="bg-accent h-48 animate-pulse rounded-lg" />
        </div>
      </PageContainer>
    );
  }

  const saveFooter = (
    <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
      Save changes
    </Button>
  );

  return (
    <PageContainer>
      <Section title="general" description="global settings for this Peon installation">
        <Panel contentClassName="space-y-4 p-4" footer={saveFooter}>
          <Field label="Instance name">
            <Input
              value={settings.instanceName ?? ''}
              onChange={(e) => set('instanceName', e.target.value)}
            />
          </Field>
          <Field label="FQDN">
            <Input
              value={settings.fqdn ?? ''}
              onChange={(e) => set('fqdn', e.target.value)}
            />
          </Field>
          <Field label="Custom DNS servers">
            <Input
              value={settings.customDnsServers ?? ''}
              onChange={(e) => set('customDnsServers', e.target.value)}
            />
          </Field>
          <Field label="Timezone">
            <Input
              value={settings.instanceTimezone ?? ''}
              onChange={(e) => set('instanceTimezone', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Public port min">
              <Input
                type="number"
                value={settings.publicPortMin ?? 0}
                onChange={(e) => set('publicPortMin', Number(e.target.value))}
              />
            </Field>
            <Field label="Public port max">
              <Input
                type="number"
                value={settings.publicPortMax ?? 0}
                onChange={(e) => set('publicPortMax', Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between">
            <Label>Registration enabled</Label>
            <Switch
              checked={settings.isRegistrationEnabled ?? false}
              onCheckedChange={(v) => set('isRegistrationEnabled', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>API enabled</Label>
            <Switch
              checked={settings.isApiEnabled ?? false}
              onCheckedChange={(v) => set('isApiEnabled', v)}
            />
          </div>
        </Panel>
      </Section>

      <Section
        title="google sign-in"
        description="Uses Google Identity Services with a client ID only — no client secret required."
      >
        <Panel contentClassName="space-y-4 p-4" footer={saveFooter}>
          <div className="flex items-center justify-between">
            <Label>Enabled</Label>
            <Switch checked={oauthEnabled} onCheckedChange={setOauthEnabled} />
          </div>
          <Field label="Client ID">
            <Input
              value={oauthClientId}
              onChange={(e) => setOauthClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
            />
          </Field>
          <p className="text-muted-foreground text-[12px]">
            Prefer setting <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in the
            environment for the sign-in button. Instance client ID is optional metadata.
          </p>
        </Panel>
      </Section>
    </PageContainer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
