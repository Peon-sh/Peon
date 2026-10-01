'use client';

import { use, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FormField,
  FormSection,
  KeyValueList,
  PageContainer,
  PageHeader,
  Panel,
} from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { KindChip } from '@/components/app/kind-chip';
import {
  getSource,
  updateSource,
  listSourceResources,
  startGithubConnect,
  type SourceDetail,
} from '@/services/api/sources';
import { listPrivateKeys } from '@/services/api/privatekey';
import { useAuthStore } from '@/store/auth';
import { publicEnv } from '@/lib/env';
import { githubInstallationSettingsUrl } from '@/lib/github-urls';
import { githubAppEventsWebhookUrl, githubAppSetupUrl } from '@/lib/webhooks/github';
import { Boxes, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { Callout, CalloutSteps } from '@/components/app/callout';

function isPlatformGithubSource(source: SourceDetail) {
  return source.provider === 'github' && source.kind === 'PLATFORM';
}

/** Where "Open in provider" goes: the installation settings for the Peon app, else the provider host. */
function providerUrl(source: SourceDetail) {
  if (source.provider === 'github' && source.kind === 'PLATFORM') {
    return githubInstallationSettingsUrl({
      installationId: source.installationId,
      organization: source.organization,
      accountType: source.accountType,
    });
  }
  return source.htmlUrl;
}

export default function SourceDetailPage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = use(params);
  const { data: source, isLoading } = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => getSource(sourceId),
  });

  if (isLoading || !source) {
    return (
      <PageContainer>
        <div className="bg-accent h-20 animate-pulse rounded-lg" />
        <div className="bg-accent h-72 animate-pulse rounded-lg" />
      </PageContainer>
    );
  }

  const providerLabel =
    source.provider === 'github'
      ? isPlatformGithubSource(source)
        ? 'GitHub (Peon GitHub App)'
        : 'GitHub'
      : 'GitLab';

  return (
    <PageContainer>
      <PageHeader
        title={source.name}
        description={providerLabel}
        actions={
          <Button asChild variant="outline">
            <a href={providerUrl(source)} target="_blank" rel="noreferrer">
              Open in {source.provider === 'github' ? 'GitHub' : 'GitLab'}{' '}
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        }
      />
      <Tabs defaultValue="general">
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-6">
          <SourceGeneralForm source={source} />
        </TabsContent>
        <TabsContent value="resources" className="pt-6">
          <SourceResourcesTab sourceId={source.id} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function SourceResourcesTab({ sourceId }: { sourceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['source-resources', sourceId],
    queryFn: () => listSourceResources(sourceId),
  });

  return (
    <DataTable
      columns={[
        { key: 'name', header: 'Name', cell: (svc) => svc.name },
        { key: 'project', header: 'Project', cell: (svc) => svc.projectName },
        {
          key: 'repository',
          header: 'Repository',
          cell: (svc) =>
            svc.gitRepository ? (
              <span className="text-muted-foreground font-mono text-sm">
                {svc.gitRepository}
                {svc.gitBranch ? `@${svc.gitBranch}` : ''}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        { key: 'kind', header: 'Kind', cell: (svc) => <KindChip kind={svc.kind} /> },
        { key: 'status', header: 'Status', cell: (svc) => <StatusBadge status={svc.status} /> },
      ]}
      rows={data ?? []}
      rowKey={(svc) => svc.id}
      rowHref={(svc) => `/projects/${svc.projectId}/services/${svc.id}`}
      isLoading={isLoading}
      emptyState={
        <EmptyState
          icon={Boxes}
          title="No resources using this source"
          description="Services created with this Git connection will show up here."
        />
      }
    />
  );
}

function SourceGeneralForm({ source }: { source: SourceDetail }) {
  const qc = useQueryClient();
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const searchParams = useSearchParams();
  const isPlatformGithub = source.provider === 'github' && source.kind === 'PLATFORM';
  const [name, setName] = useState(source.name);
  const [organization, setOrganization] = useState(source.organization ?? '');
  const [htmlUrl, setHtmlUrl] = useState(source.htmlUrl);
  const [apiUrl, setApiUrl] = useState(source.apiUrl);
  const [customUser, setCustomUser] = useState(source.customUser);
  const [customPort, setCustomPort] = useState(String(source.customPort));
  const [appId, setAppId] = useState(source.appId ?? '');
  const [installationId, setInstallationId] = useState(
    source.provider === 'github' ? source.installationId ?? '' : '',
  );
  const [clientId, setClientId] = useState(source.provider === 'github' ? source.clientId ?? '' : '');
  const [oauthId, setOauthId] = useState(source.provider === 'gitlab' ? String(source.oauthId ?? '') : '');
  const [groupName, setGroupName] = useState(source.provider === 'gitlab' ? source.groupName ?? '' : '');
  const [clientSecret, setClientSecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [privateKeyId, setPrivateKeyId] = useState(source.privateKeyId ?? 'none');

  useEffect(() => {
    if (searchParams.get('github') === 'connected') {
      toast.success('GitHub connected');
    }
  }, [searchParams]);

  const { data: privateKeys } = useQuery({
    queryKey: ['private-keys', workspaceId],
    queryFn: () => listPrivateKeys(workspaceId!),
    enabled: !!workspaceId && !isPlatformGithub,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const base: Record<string, unknown> = {
        name,
        organization: organization || null,
        htmlUrl,
        apiUrl,
        customUser,
        customPort: Number(customPort) || 22,
        appId: appId || null,
        privateKeyId: privateKeyId === 'none' ? null : privateKeyId,
      };
      if (source.provider === 'github') {
        base.installationId = installationId || null;
        base.clientId = clientId || null;
        if (clientSecret) base.clientSecret = clientSecret;
        if (webhookSecret) base.webhookSecret = webhookSecret;
      } else {
        base.oauthId = oauthId ? Number(oauthId) : null;
        base.groupName = groupName || null;
        if (clientSecret) base.appSecret = clientSecret;
        if (webhookSecret) base.webhookToken = webhookSecret;
      }
      return updateSource(source.id, base);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['source', source.id] });
      toast.success('Source saved');
      setClientSecret('');
      setWebhookSecret('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const reconnectMut = useMutation({
    mutationFn: () => startGithubConnect(workspaceId!),
    onSuccess: ({ installUrl }) => {
      window.location.href = installUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const saveFooter = (
    <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name}>
      Save
    </Button>
  );

  if (isPlatformGithub) {
    const status = source.status;

    return (
      <div className="space-y-6">
        <Panel
          title="GitHub connection"
          footer={
            <Button
              onClick={() => reconnectMut.mutate()}
              disabled={!workspaceId || reconnectMut.isPending}
            >
              Reconnect or add org
            </Button>
          }
        >
          <KeyValueList
            items={[
              {
                label: 'Status',
                value: (
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={status}
                      tone={status === 'SUSPENDED' ? 'warning' : undefined}
                    />
                    <span className="text-muted-foreground">
                      {status === 'CONNECTED'
                        ? 'Connected via Peon GitHub App'
                        : status === 'SUSPENDED'
                          ? 'Suspended on GitHub. Reconnect or unsuspend the app.'
                          : 'Disconnected. Reconnect to restore deploys.'}
                    </span>
                  </span>
                ),
              },
              {
                label: 'Installation',
                value: source.installationId ? (
                  <span className="font-mono">
                    {source.installationId}
                    {source.organization ? ` · ${source.organization}` : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Missing installation</span>
                ),
              },
              ...(source.accountType
                ? [{ label: 'Account type', value: source.accountType }]
                : []),
            ]}
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {source.provider === 'github' && (
        <GithubAppSetupDocs
          source={source}
          appId={appId}
          installationId={installationId}
          clientId={clientId}
          organization={organization}
          name={name}
        />
      )}

      <FormSection title="General" footer={saveFooter}>
        <Field id="src-name" label="App name" value={name} onChange={setName} />
        <Field id="src-org" label="Organization" value={organization} onChange={setOrganization} />
        <Field id="src-html" label="HTML URL" value={htmlUrl} onChange={setHtmlUrl} />
        <Field id="src-api" label="API URL" value={apiUrl} onChange={setApiUrl} />
        <Field id="src-user" label="User" value={customUser} onChange={setCustomUser} />
        <Field id="src-port" label="Port" value={customPort} onChange={setCustomPort} />
      </FormSection>

      <FormSection title="Provider credentials" footer={saveFooter}>
        <Field id="src-app-id" label="App ID" value={appId} onChange={setAppId} />
        {source.provider === 'github' ? (
          <>
            <Field id="src-installation-id" label="Installation ID" value={installationId} onChange={setInstallationId} />
            <Field id="src-client-id" label="Client ID" value={clientId} onChange={setClientId} />
            <Field id="src-client-secret" label="Client secret" value={clientSecret} onChange={setClientSecret} type="password" placeholder="Unchanged" />
            <Field id="src-webhook-secret" label="Webhook secret" value={webhookSecret} onChange={setWebhookSecret} type="password" placeholder="Unchanged" />
          </>
        ) : (
          <>
            <Field id="src-oauth-id" label="OAuth ID" value={oauthId} onChange={setOauthId} />
            <Field id="src-group-name" label="Group name" value={groupName} onChange={setGroupName} />
            <Field id="src-app-secret" label="App secret" value={clientSecret} onChange={setClientSecret} type="password" placeholder="Unchanged" />
            <Field id="src-webhook-token" label="Webhook token" value={webhookSecret} onChange={setWebhookSecret} type="password" placeholder="Unchanged" />
          </>
        )}
        <FormField label="Private key">
          <SearchableSelect
            value={privateKeyId}
            onValueChange={setPrivateKeyId}
            placeholder="Select private key"
            options={[
              { value: 'none', label: 'No private key' },
              ...(privateKeys ?? []).map((key) => ({ value: key.id, label: key.name })),
            ]}
          />
        </FormField>
      </FormSection>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <FormField label={label}>
      <div className="flex min-w-0 items-center gap-2">
        <Input readOnly value={value} className="min-w-0 flex-1 font-mono text-sm" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </FormField>
  );
}

function StatusValue({ ok, detail }: { ok: boolean; detail: string }) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 ${ok ? 'text-success' : 'text-muted-foreground'}`} />
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{detail}</span>
    </span>
  );
}

function GithubAppSetupDocs({
  source,
  appId,
  installationId,
  clientId,
  organization,
  name,
}: {
  source: Extract<SourceDetail, { provider: 'github' }>;
  appId: string;
  installationId: string;
  clientId: string;
  organization: string;
  name: string;
}) {
  const webhookUrl = githubAppEventsWebhookUrl(publicEnv.appUrl);
  const setupUrl = githubAppSetupUrl(publicEnv.appUrl, source.id);
  const appSettingsUrl = organization
    ? `https://github.com/organizations/${organization}/settings/apps`
    : 'https://github.com/settings/apps';
  const createAppUrl = organization
    ? `https://github.com/organizations/${organization}/apps/new`
    : 'https://github.com/settings/apps/new';
  const incomplete = !appId || !clientId || !installationId || !source.privateKeyId;

  return (
    <div className="space-y-4">
      <Callout
        title={incomplete ? 'Finish GitHub App setup' : 'How to finish GitHub App setup'}
        tone={incomplete ? 'warning' : 'info'}
      >
        <CalloutSteps>
          <li>
            Open your App → <b>General</b>. Set Homepage URL to{' '}
            <span className="text-foreground font-mono">{publicEnv.appUrl}</span>.
          </li>
          <li>
            Webhook: paste the Webhook URL from the setup card below (GitHub App → General → Webhook
            → Active). Secret must match the Webhook secret on this source.
          </li>
          <li>
            Post installation: paste the Setup URL from the card below. Check{' '}
            <b>Redirect on update</b> if you want repo add/remove to return here. Then paste the
            Installation ID from the GitHub URL if it is still empty on this source.
          </li>
          <li>
            <b>Permissions &amp; events</b> → Repository permissions: Contents Read, Metadata Read,
            Pull requests Read &amp; write, Issues Read &amp; write (sticky PR preview comments),
            Checks Read &amp; write (PR Checks status like Vercel), Deployments Read &amp; write (PR
            timeline &quot;deployed to Preview&quot; like Vercel). Subscribe to events: <b>Push</b>,{' '}
            <b>Pull request</b>.
          </li>
          <li>
            Save, then <b>Install App</b> on the account/org that owns your repos
            {organization ? (
              <>
                {' '}
                (<span className="font-mono">{organization}</span>)
              </>
            ) : null}
            . Copy the Installation ID into this source and Save.
          </li>
          <li>
            Link services with Git source type <b>GitHub App</b> and this source. Pushes to the tracked
            branch will queue deploys with <span className="font-mono">triggeredBy: webhook</span>.
          </li>
        </CalloutSteps>
      </Callout>

      <Panel
        title="GitHub App setup"
        description={
          <>
            Values below are generated for{' '}
            <span className="text-foreground font-medium">{name || 'this source'}</span>
            {organization ? (
              <>
                {' '}
                (org <span className="text-foreground font-mono">{organization}</span>)
              </>
            ) : null}
            . Paste them into your GitHub App; no per-repo webhook is needed.
          </>
        }
        contentClassName="space-y-6"
        footer={
          <>
            <Button asChild variant="outline">
              <a href={appSettingsUrl} target="_blank" rel="noreferrer">
                Open GitHub Apps <ExternalLink className="size-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={createAppUrl} target="_blank" rel="noreferrer">
                Create new app <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </>
        }
      >
        <KeyValueList
          items={[
            {
              label: 'App ID',
              value: (
                <StatusValue
                  ok={!!appId}
                  detail={appId ? `Saved as ${appId}` : 'Missing. Copy it from GitHub App → About.'}
                />
              ),
            },
            {
              label: 'Client ID',
              value: (
                <StatusValue
                  ok={!!clientId}
                  detail={clientId ? `Saved as ${clientId}` : 'Missing. Copy it from GitHub App → About.'}
                />
              ),
            },
            {
              label: 'Installation ID',
              value: (
                <StatusValue
                  ok={!!installationId}
                  detail={
                    installationId
                      ? `Saved as ${installationId}`
                      : 'Missing. After Install App, copy the number from …/installations/<ID>.'
                  }
                />
              ),
            },
            {
              label: 'Private key',
              value: (
                <StatusValue
                  ok={!!source.privateKeyId}
                  detail={
                    source.privateKeyId
                      ? 'Linked. Used to mint installation tokens for private clones.'
                      : 'Missing. Generate a .pem on the app and attach it under MCP & SSH keys → SSH keys.'
                  }
                />
              ),
            },
          ]}
        />

        <div className="space-y-4">
          <CopyField label="Webhook URL" value={webhookUrl} />
          <CopyField label="Setup URL (post-install redirect)" value={setupUrl} />
        </div>
      </Panel>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  );
}
