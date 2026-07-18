'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageContainer, Panel } from '@/components/app/page';
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
import { DocCallout, DocSteps } from '@/components/app/doc-callout';

const TABS_LIST_CLASS =
  'h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0';
const TABS_TRIGGER_CLASS =
  'rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 pb-2 text-[12.5px] shadow-none data-[state=active]:border-phosphor data-[state=active]:bg-transparent data-[state=active]:text-phosphor data-[state=active]:shadow-none';

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

  return (
    <PageContainer>
      <Tabs defaultValue="general">
        <TabsList className={TABS_LIST_CLASS}>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="general">General</TabsTrigger>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="resources">Resources</TabsTrigger>
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

  if (isLoading) {
    return <div className="bg-accent h-40 animate-pulse rounded-lg" />;
  }

  if (!data?.length) {
    return (
      <EmptyState
        icon={Boxes}
        title="No resources using this source"
        description="Services created with this Git connection will show up here."
      />
    );
  }

  return (
    <Panel title="resources" contentClassName="divide-y">
      {data.map((svc) => (
        <Link
          key={svc.id}
          href={`/projects/${svc.projectId}/services/${svc.id}`}
          className="hover:bg-secondary flex items-center justify-between gap-4 px-4 py-3 transition-colors"
        >
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold">{svc.name}</div>
            <div className="text-muted-foreground truncate text-[11px]">
              {svc.projectName}
              {svc.gitRepository ? ` · ${svc.gitRepository}` : ''}
              {svc.gitBranch ? `@${svc.gitBranch}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <KindChip kind={svc.kind} />
            <StatusBadge status={svc.status} />
          </div>
        </Link>
      ))}
    </Panel>
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
    <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name}>
      Save
    </Button>
  );

  if (isPlatformGithub) {
    const status = source.status;
    // Derive from accountType — organization field is the login for both User and Org.
    const installSettingsUrl = githubInstallationSettingsUrl({
      installationId: source.installationId,
      organization: source.organization,
      accountType: source.accountType,
    });

    return (
      <div className="space-y-6">
        <Panel
          title="GitHub connection"
          contentClassName="space-y-4 p-4"
          footer={
            <>
              <Button
                size="sm"
                onClick={() => reconnectMut.mutate()}
                disabled={!workspaceId || reconnectMut.isPending}
              >
                Reconnect / add org
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={installSettingsUrl} target="_blank" rel="noreferrer">
                  Open on GitHub <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusRow
              ok={status === 'CONNECTED'}
              label="Status"
              detail={
                status === 'CONNECTED'
                  ? 'Connected via Peon GitHub App'
                  : status === 'SUSPENDED'
                    ? 'Suspended on GitHub — reconnect or unsuspend the App'
                    : 'Disconnected — reconnect to restore deploys'
              }
            />
            <StatusRow
              ok={!!source.installationId}
              label="Installation"
              detail={
                source.installationId
                  ? `ID ${source.installationId}${source.organization ? ` · ${source.organization}` : ''}`
                  : 'Missing installation'
              }
            />
          </div>
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

      <Panel title="general" contentClassName="grid gap-4 p-4 md:grid-cols-2" footer={saveFooter}>
        <Field id="src-name" label="App name" value={name} onChange={setName} />
        <Field id="src-org" label="Organization" value={organization} onChange={setOrganization} />
        <Field id="src-html" label="HTML URL" value={htmlUrl} onChange={setHtmlUrl} />
        <Field id="src-api" label="API URL" value={apiUrl} onChange={setApiUrl} />
        <Field id="src-user" label="User" value={customUser} onChange={setCustomUser} />
        <Field id="src-port" label="Port" value={customPort} onChange={setCustomPort} />
      </Panel>

      <Panel
        title="provider credentials"
        contentClassName="grid gap-4 p-4 md:grid-cols-2"
        footer={saveFooter}
      >
        <Field id="src-app-id" label="App ID" value={appId} onChange={setAppId} />
        {source.provider === 'github' ? (
          <>
            <Field id="src-installation-id" label="Installation ID" value={installationId} onChange={setInstallationId} />
            <Field id="src-client-id" label="Client ID" value={clientId} onChange={setClientId} />
            <Field id="src-client-secret" label="Client secret" value={clientSecret} onChange={setClientSecret} type="password" placeholder="unchanged" />
            <Field id="src-webhook-secret" label="Webhook secret" value={webhookSecret} onChange={setWebhookSecret} type="password" placeholder="unchanged" />
          </>
        ) : (
          <>
            <Field id="src-oauth-id" label="OAuth ID" value={oauthId} onChange={setOauthId} />
            <Field id="src-group-name" label="Group name" value={groupName} onChange={setGroupName} />
            <Field id="src-app-secret" label="App secret" value={clientSecret} onChange={setClientSecret} type="password" placeholder="unchanged" />
            <Field id="src-webhook-token" label="Webhook token" value={webhookSecret} onChange={setWebhookSecret} type="password" placeholder="unchanged" />
          </>
        )}
        <div className="space-y-2">
          <Label>Private key</Label>
          <SearchableSelect
            value={privateKeyId}
            onValueChange={setPrivateKeyId}
            placeholder="Select private key"
            options={[
              { value: 'none', label: 'No private key' },
              ...(privateKeys ?? []).map((key) => ({ value: key.id, label: key.name })),
            ]}
          />
        </div>
      </Panel>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        <Input readOnly value={value} className="min-w-0 flex-1 font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-[12px]">
      <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 ${ok ? 'text-phosphor' : 'text-muted-foreground/40'}`} />
      <div className="min-w-0">
        <p className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</p>
        <p className="text-muted-foreground break-words text-[11px]">{detail}</p>
      </div>
    </div>
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

  return (
    <div className="space-y-4">
      <DocCallout title="How to finish GitHub App setup">
        <DocSteps>
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
        </DocSteps>
      </DocCallout>

      <Panel title="GitHub App setup" contentClassName="space-y-5 p-4">
        <p className="text-muted-foreground text-[12.5px]">
          Values below are generated for{' '}
          <span className="text-foreground font-medium">{name || 'this source'}</span>
          {organization ? (
            <>
              {' '}
              (org <span className="text-foreground font-mono">{organization}</span>)
            </>
          ) : null}
          . Paste them into your GitHub App — no per-repo webhook needed.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatusRow
            ok={!!appId}
            label="App ID"
            detail={appId ? `Saved as ${appId}` : 'Missing — copy from GitHub App → About'}
          />
          <StatusRow
            ok={!!clientId}
            label="Client ID"
            detail={clientId ? `Saved as ${clientId}` : 'Missing — copy from GitHub App → About'}
          />
          <StatusRow
            ok={!!installationId}
            label="Installation ID"
            detail={
              installationId
                ? `Saved as ${installationId}`
                : 'Missing — after Install App, copy the number from …/installations/<ID>'
            }
          />
          <StatusRow
            ok={!!source.privateKeyId}
            label="Private key"
            detail={
              source.privateKeyId
                ? 'Linked — used to mint installation tokens for private clones'
                : 'Missing — generate a .pem on the App and attach it under Security → SSH Keys'
            }
          />
        </div>

        <div className="space-y-3">
          <CopyField label="Webhook URL" value={webhookUrl} />
          <CopyField label="Setup URL (post-install redirect)" value={setupUrl} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={appSettingsUrl} target="_blank" rel="noreferrer">
              Open GitHub Apps <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={createAppUrl} target="_blank" rel="noreferrer">
              Create new App <ExternalLink className="size-3.5" />
            </a>
          </Button>
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
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
