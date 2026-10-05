'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { FormField, FormSection, PageContainer, PageHeader } from '@/components/app/page';
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
  const [prevData, setPrevData] = useState(data);

  if (data !== prevData) {
    setPrevData(data);
    if (!data) {
      setHydrated(false);
    } else {
      setSettings(data.settings);
      const google = data.oauth.find((o) => o.provider === 'google');
      setOauthEnabled(google?.enabled ?? false);
      setOauthClientId(google?.clientId ?? '');
      setHydrated(true);
    }
  }

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

  const header = <PageHeader title="Instance" description="This Peon installation" />;

  if (!isOwner) {
    return (
      <PageContainer>
        {header}
        <p className="text-muted-foreground text-sm">
          Only the Peon instance owner can view global instance settings.
        </p>
      </PageContainer>
    );
  }

  if (isPending || !data || !hydrated) {
    return (
      <PageContainer>
        {header}
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </PageContainer>
    );
  }

  const saveFooter = (
    <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
      Save changes
    </Button>
  );

  return (
    <PageContainer>
      {header}

      <FormSection
        title="General"
        description="Global settings for this Peon installation."
        footer={saveFooter}
      >
        <FormField label="Instance name" htmlFor="instance-name">
          <Input
            id="instance-name"
            value={settings.instanceName ?? ''}
            onChange={(e) => set('instanceName', e.target.value)}
          />
        </FormField>
        <FormField label="FQDN" htmlFor="instance-fqdn">
          <Input
            id="instance-fqdn"
            className="font-mono"
            value={settings.fqdn ?? ''}
            onChange={(e) => set('fqdn', e.target.value)}
          />
        </FormField>
        <FormField label="Custom DNS servers" htmlFor="instance-dns">
          <Input
            id="instance-dns"
            className="font-mono"
            value={settings.customDnsServers ?? ''}
            onChange={(e) => set('customDnsServers', e.target.value)}
          />
        </FormField>
        <FormField label="Timezone" htmlFor="instance-tz">
          <Input
            id="instance-tz"
            value={settings.instanceTimezone ?? ''}
            onChange={(e) => set('instanceTimezone', e.target.value)}
          />
        </FormField>
        <FormField label="Public port range" description="Minimum and maximum public ports.">
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="Public port min"
              type="number"
              value={settings.publicPortMin ?? 0}
              onChange={(e) => set('publicPortMin', Number(e.target.value))}
            />
            <Input
              aria-label="Public port max"
              type="number"
              value={settings.publicPortMax ?? 0}
              onChange={(e) => set('publicPortMax', Number(e.target.value))}
            />
          </div>
        </FormField>
        <FormField label="Registration enabled" htmlFor="instance-registration">
          <Switch
            id="instance-registration"
            checked={settings.isRegistrationEnabled ?? false}
            onCheckedChange={(v) => set('isRegistrationEnabled', v)}
          />
        </FormField>
        <FormField label="API enabled" htmlFor="instance-api">
          <Switch
            id="instance-api"
            checked={settings.isApiEnabled ?? false}
            onCheckedChange={(v) => set('isApiEnabled', v)}
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Google sign-in"
        description="Uses Google Identity Services with a client ID only. No client secret required."
        footer={saveFooter}
      >
        <FormField label="Enabled" htmlFor="google-enabled">
          <Switch id="google-enabled" checked={oauthEnabled} onCheckedChange={setOauthEnabled} />
        </FormField>
        <FormField
          label="Client ID"
          htmlFor="google-client-id"
          description={
            <>
              Prefer setting <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in the
              environment for the sign-in button. Instance client ID is optional metadata.
            </>
          }
        >
          <Input
            id="google-client-id"
            className="font-mono"
            value={oauthClientId}
            onChange={(e) => setOauthClientId(e.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
          />
        </FormField>
      </FormSection>
    </PageContainer>
  );
}
