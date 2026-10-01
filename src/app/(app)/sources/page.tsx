'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, GitBranch, GitBranchPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FormField, PageContainer, PageHeader } from '@/components/app/page';
import { Callout, CalloutSteps } from '@/components/app/callout';
import { ConfirmButton } from '@/components/app/confirm';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { useAuthStore } from '@/store/auth';
import { listPrivateKeys } from '@/services/api/privatekey';
import {
  listSources,
  createSource,
  deleteSource,
  startGithubConnect,
  type CreateSourcePayload,
} from '@/services/api/sources';

type Provider = 'github' | 'gitlab';

type SourceRow = {
  provider: Provider;
  id: string;
  name: string;
  organization: string | null;
  htmlUrl: string;
};

const PROVIDER_LABEL: Record<Provider, string> = { github: 'GitHub', gitlab: 'GitLab' };
const MODAL_FIELD = 'lg:grid-cols-1 lg:gap-2';

export default function SourcesPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>('github');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [appId, setAppId] = useState('');
  const [installationId, setInstallationId] = useState('');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [htmlUrl, setHtmlUrl] = useState('https://github.com');
  const [apiUrl, setApiUrl] = useState('https://api.github.com');
  const [customUser, setCustomUser] = useState('git');
  const [customPort, setCustomPort] = useState('22');
  const [privateKeyId, setPrivateKeyId] = useState('none');

  const { data, isLoading } = useQuery({
    queryKey: ['sources', wsId],
    queryFn: () => listSources(wsId),
    enabled: !!wsId,
  });

  const { data: privateKeys } = useQuery({
    queryKey: ['private-keys', wsId],
    queryFn: () => listPrivateKeys(wsId),
    enabled: open && !!wsId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sources', wsId] });

  const reset = () => {
    setProvider('github');
    setName('');
    setOrganization('');
    setAppId('');
    setInstallationId('');
    setClientId('');
    setSecret('');
    setWebhookSecret('');
    setHtmlUrl('https://github.com');
    setApiUrl('https://api.github.com');
    setCustomUser('git');
    setCustomPort('22');
    setPrivateKeyId('none');
  };

  const createMut = useMutation({
    mutationFn: () => {
      const payload: CreateSourcePayload =
        provider === 'github'
          ? {
              provider: 'github',
              name,
              organization: organization || null,
              htmlUrl,
              apiUrl,
              customUser,
              customPort: Number(customPort) || 22,
              appId: appId || null,
              installationId: installationId || null,
              clientId: clientId || null,
              clientSecret: secret || undefined,
              webhookSecret: webhookSecret || undefined,
              privateKeyId: privateKeyId === 'none' ? null : privateKeyId,
              isSystemWide: false,
              isPublic: false,
            }
          : {
              provider: 'gitlab',
              name,
              organization: organization || null,
              htmlUrl,
              apiUrl,
              customUser,
              customPort: Number(customPort) || 22,
              appId: appId || null,
              appSecret: secret || undefined,
              webhookToken: webhookSecret || undefined,
              privateKeyId: privateKeyId === 'none' ? null : privateKeyId,
              isSystemWide: false,
              isPublic: false,
            };
      return createSource(wsId, payload);
    },
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      reset();
      toast.success('Source created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSource(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Source deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const connectMut = useMutation({
    mutationFn: () => startGithubConnect(wsId),
    onSuccess: ({ installUrl }) => {
      window.location.href = installUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to start GitHub connect'),
  });

  const platformReady = data?.platformGithubConfigured === true;

  const rows: SourceRow[] = [
    ...(data?.github ?? []).map((s) => ({ ...s, provider: 'github' as const })),
    ...(data?.gitlab ?? []).map((s) => ({ ...s, provider: 'gitlab' as const })),
  ];

  const connectButton = platformReady ? (
    <Button variant="outline" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
      <GitBranchPlus className="size-4" />
      {connectMut.isPending ? 'Redirecting…' : 'Connect to GitHub'}
    </Button>
  ) : null;

  const addButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> Add source
    </Button>
  );

  const createDialog = (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <ModalContent size="xl">
        <ModalHeader>
          <ModalTitle>Add custom Git app</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {provider === 'github' && <GithubAppGuide organization={organization} />}
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Provider" className={MODAL_FIELD}>
              <SearchableSelect
                value={provider}
                onValueChange={(v) => setProvider(v as Provider)}
                placeholder="Select provider"
                options={[
                  { value: 'github', label: 'GitHub' },
                  { value: 'gitlab', label: 'GitLab' },
                ]}
              />
            </FormField>
            <FormField label="Private key" className={MODAL_FIELD}>
              <SearchableSelect
                value={privateKeyId}
                onValueChange={setPrivateKeyId}
                placeholder="Select private key"
                options={[
                  { value: 'none', label: 'No private key' },
                  ...(privateKeys ?? []).map((key) => ({
                    value: key.id,
                    label: key.name,
                    keywords: key.fingerprint ?? undefined,
                  })),
                ]}
              />
            </FormField>
            <FormField label="Name" htmlFor="src-name" className={MODAL_FIELD}>
              <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="Organization" htmlFor="src-org" className={MODAL_FIELD}>
              <Input
                id="src-org"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </FormField>
            <FormField label="HTML URL" htmlFor="src-html" className={MODAL_FIELD}>
              <Input id="src-html" value={htmlUrl} onChange={(e) => setHtmlUrl(e.target.value)} />
            </FormField>
            <FormField label="API URL" htmlFor="src-api" className={MODAL_FIELD}>
              <Input id="src-api" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            </FormField>
            <FormField label="Git user" htmlFor="src-user" className={MODAL_FIELD}>
              <Input id="src-user" value={customUser} onChange={(e) => setCustomUser(e.target.value)} />
            </FormField>
            <FormField label="Git port" htmlFor="src-port" className={MODAL_FIELD}>
              <Input id="src-port" value={customPort} onChange={(e) => setCustomPort(e.target.value)} />
            </FormField>
            <FormField label="App ID" htmlFor="src-appid" className={MODAL_FIELD}>
              <Input id="src-appid" value={appId} onChange={(e) => setAppId(e.target.value)} />
            </FormField>
            {provider === 'github' && (
              <>
                <FormField label="Installation ID" htmlFor="src-installationid" className={MODAL_FIELD}>
                  <Input
                    id="src-installationid"
                    value={installationId}
                    onChange={(e) => setInstallationId(e.target.value)}
                  />
                </FormField>
                <FormField label="Client ID" htmlFor="src-clientid" className={MODAL_FIELD}>
                  <Input
                    id="src-clientid"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </FormField>
              </>
            )}
            <FormField
              label={provider === 'github' ? 'Client secret' : 'App secret'}
              htmlFor="src-secret"
              className={MODAL_FIELD}
            >
              <Input
                id="src-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </FormField>
            <FormField
              label={provider === 'github' ? 'Webhook secret' : 'Webhook token'}
              htmlFor="src-webhook-secret"
              className={MODAL_FIELD}
            >
              <Input
                id="src-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            Add source
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return (
    <PageContainer>
      {createDialog}
      <PageHeader
        title="Git sources"
        description="GitHub and GitLab apps that can deploy"
        actions={
          <>
            {connectButton}
            {addButton}
          </>
        }
      />

      <DataTable
        columns={[
          { key: 'name', header: 'Name', cell: (s) => s.name },
          { key: 'provider', header: 'Provider', cell: (s) => PROVIDER_LABEL[s.provider] },
          {
            key: 'organization',
            header: 'Organization',
            cell: (s) => (
              <span className="text-muted-foreground">
                {s.organization ?? <span className="font-mono">{s.htmlUrl}</span>}
              </span>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (s) => (
              <ConfirmButton
                title={`Delete source "${s.name}"?`}
                description="Services using this git connection will lose deploy access until they are reassigned."
                confirmLabel="Delete"
                variant="ghost"
                onConfirm={() => deleteMut.mutate(s.id)}
              >
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            ),
          },
        ]}
        rows={rows}
        rowKey={(s) => `${s.provider}-${s.id}`}
        rowHref={(s) => `/sources/${s.id}`}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={GitBranch}
            title="No Git sources yet"
            description={
              platformReady
                ? 'Install the Peon GitHub App on an account or org, or bring your own GitHub or GitLab app.'
                : 'Bring your own GitHub or GitLab app to deploy from your repositories.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {connectButton}
                {addButton}
              </div>
            }
          />
        }
      />
    </PageContainer>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  );
}

/**
 * Step-by-step guide (with deep links) for creating and installing a GitHub
 * App, so users know where each field in this dialog comes from.
 */
function GithubAppGuide({ organization }: { organization: string }) {
  const createUrl = organization
    ? `https://github.com/organizations/${organization}/apps/new`
    : 'https://github.com/settings/apps/new';

  return (
    <Callout title="How do I create a GitHub App?">
      <CalloutSteps>
        <li>
          Open{' '}
          <ExtLink href={createUrl}>
            {organization
              ? `github.com/organizations/${organization}/apps/new`
              : 'github.com/settings/apps/new'}
          </ExtLink>{' '}
          (fill the Organization field above first if the app should belong to an org).
        </li>
        <li>
          Set any <b>App name</b> and use{' '}
          <span className="text-foreground font-mono">
            {typeof window !== 'undefined' ? window.location.origin : ''}
          </span>{' '}
          as the Homepage URL. Set the Webhook URL to{' '}
          <span className="text-foreground font-mono">
            {typeof window !== 'undefined' ? window.location.origin : ''}
            /webhooks/source/github/events
          </span>{' '}
          (Active), and paste the same webhook secret into this form.
        </li>
        <li>
          Under <b>Repository permissions</b> grant: Contents — <b>Read-only</b>, Metadata —{' '}
          <b>Read-only</b>, Pull requests — <b>Read &amp; write</b>, Issues —{' '}
          <b>Read &amp; write</b> (PR comments for preview status), Checks —{' '}
          <b>Read &amp; write</b> (shows under PR Checks like Vercel), Deployments —{' '}
          <b>Read &amp; write</b> (PR timeline &quot;deployed to Preview&quot; like Vercel). Subscribe
          to events: <b>Push</b>, <b>Pull request</b>.
        </li>
        <li>
          After creating, copy the <b>App ID</b> and <b>Client ID</b> into this form, then click{' '}
          <b>Generate a new client secret</b> and paste it below.
        </li>
        <li>
          Scroll to <b>Private keys</b> → <b>Generate a private key</b>. Add the downloaded{' '}
          <span className="font-mono">.pem</span> under{' '}
          <ExtLink href="/keys-and-tokens">MCP &amp; SSH keys → SSH keys</ExtLink>, then select it in the Private
          key dropdown above — it&apos;s used to mint installation tokens for cloning private
          repos.
        </li>
        <li>
          Install the app on your account/org (<b>Install App</b> in the sidebar of your GitHub App
          page) and pick the repositories to expose. The <b>Installation ID</b> is the number at
          the end of the URL after installing:{' '}
          <span className="font-mono">github.com/organizations/&lt;org&gt;/settings/installations/&lt;ID&gt;</span>{' '}
          (or <span className="font-mono">github.com/settings/installations/&lt;ID&gt;</span> for user
          installs).
        </li>
      </CalloutSteps>
    </Callout>
  );
}
