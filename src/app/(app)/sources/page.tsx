'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, GitBranch, GitBranchPlus, GitMerge, Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PageContainer } from '@/components/app/page';
import { ConfirmButton } from '@/components/app/confirm';
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
          <ModalTitle>Add custom Git App</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {provider === 'github' && <GithubAppGuide organization={organization} />}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <SearchableSelect
                value={provider}
                onValueChange={(v) => setProvider(v as Provider)}
                placeholder="Select provider"
                options={[
                  { value: 'github', label: 'GitHub' },
                  { value: 'gitlab', label: 'GitLab' },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label>Private key</Label>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-name">Name</Label>
              <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-org">Organization</Label>
              <Input
                id="src-org"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-html">HTML URL</Label>
              <Input id="src-html" value={htmlUrl} onChange={(e) => setHtmlUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-api">API URL</Label>
              <Input id="src-api" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-user">Git user</Label>
              <Input id="src-user" value={customUser} onChange={(e) => setCustomUser(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-port">Git port</Label>
              <Input id="src-port" value={customPort} onChange={(e) => setCustomPort(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-appid">App ID</Label>
              <Input id="src-appid" value={appId} onChange={(e) => setAppId(e.target.value)} />
            </div>
            {provider === 'github' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="src-installationid">Installation ID</Label>
                  <Input
                    id="src-installationid"
                    value={installationId}
                    onChange={(e) => setInstallationId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="src-clientid">Client ID</Label>
                  <Input
                    id="src-clientid"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="src-secret">
                {provider === 'github' ? 'Client secret' : 'App secret'}
              </Label>
              <Input
                id="src-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="src-webhook-secret">
                {provider === 'github' ? 'Webhook secret' : 'Webhook token'}
              </Label>
              <Input
                id="src-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            Create
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return (
    <PageContainer>
      {createDialog}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-accent h-36 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.github ?? []).map((s) => (
            <SourceCard
              key={s.id}
              provider="github"
              item={s}
              onDelete={() => deleteMut.mutate(s.id)}
            />
          ))}
          {(data?.gitlab ?? []).map((s) => (
            <SourceCard
              key={s.id}
              provider="gitlab"
              item={s}
              onDelete={() => deleteMut.mutate(s.id)}
            />
          ))}

          {platformReady ? (
            <button
              type="button"
              onClick={() => connectMut.mutate()}
              disabled={connectMut.isPending}
              className="border-phosphor-dim bg-phosphor/10 text-foreground hover:bg-phosphor/15 hover:border-phosphor grid min-h-36 place-items-center rounded-lg border transition-colors disabled:opacity-60"
            >
              <span className="flex flex-col items-center gap-2.5 px-4 text-center">
                <span className="bg-phosphor/20 text-phosphor grid size-9 place-items-center rounded-md">
                  <GitBranchPlus className="size-4" />
                </span>
                <span className="text-[13px] font-semibold">
                  {connectMut.isPending ? 'Redirecting…' : 'Connect to GitHub'}
                </span>
                <span className="text-muted-foreground text-[11px] leading-snug">
                  Install Peon’s GitHub App on an account or org
                </span>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-border-bright text-muted-foreground hover:text-phosphor hover:border-phosphor-dim grid min-h-36 place-items-center rounded-lg border border-dashed transition-colors"
          >
            <span className="flex flex-col items-center gap-2 px-4 text-center text-[12.5px]">
              <Plus className="size-4" />
              Add your custom app
              <span className="text-muted-foreground/80 text-[11px]">
                Bring your own GitHub or GitLab App
              </span>
            </span>
          </button>
        </div>
      )}
    </PageContainer>
  );
}

/**
 * Step-by-step guide (with deep links) for creating and installing a GitHub
 * App, so users know where each field in this dialog comes from.
 */
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
      {children}
    </a>
  );
}

function GithubAppGuide({ organization }: { organization: string }) {
  const [open, setOpen] = useState(false);
  const createUrl = organization
    ? `https://github.com/organizations/${organization}/apps/new`
    : 'https://github.com/settings/apps/new';

  return (
    <div className="border-border-bright rounded-md border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-left text-[12px] transition-colors"
      >
        <span>How do I create a GitHub App?</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ol className="text-muted-foreground list-decimal space-y-2 border-t px-3 py-3 pl-7 text-[12px]">
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
            <ExtLink href="/keys-and-tokens">Keys & Tokens → SSH Keys</ExtLink>, then select it in the Private
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
        </ol>
      )}
    </div>
  );
}

function SourceCard({
  provider,
  item,
  onDelete,
}: {
  provider: Provider;
  item: { id: string; name: string; organization: string | null; htmlUrl: string };
  onDelete: () => void;
}) {
  return (
    <div className="bg-card hover:border-border-bright hover:bg-secondary flex h-full flex-col overflow-hidden rounded-lg border transition-colors">
      <Link href={`/sources/${item.id}`} className="flex items-start gap-3 p-4">
        <span className="border-border-bright bg-secondary text-phosphor grid size-9 shrink-0 place-items-center rounded-md border">
          {provider === 'github' ? <GitBranch className="size-4" /> : <GitMerge className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold">{item.name}</p>
          <p className="text-muted-foreground truncate text-[11px]">
            {provider} {item.organization ? `· ${item.organization}` : `· ${item.htmlUrl}`}
          </p>
        </div>
      </Link>
      <div className="bg-secondary mt-auto flex items-center gap-2 border-t px-4 py-2.5">
        <ConfirmButton
          title={`Delete source "${item.name}"?`}
          description="Services using this git connection will lose deploy access until they are reassigned."
          confirmLabel="Delete"
          size="sm"
          onConfirm={onDelete}
        >
          <Trash2 className="size-4" /> Delete
        </ConfirmButton>
      </div>
    </div>
  );
}
