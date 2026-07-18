'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, KeyRound, Ticket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/app/modal';
import { ConfirmButton } from '@/components/app/confirm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { PageContainer, Panel } from '@/components/app/page';
import { DocCallout, DocBullets } from '@/components/app/doc-callout';
import { EmptyState } from '@/components/app/empty-state';
import { useAuthStore } from '@/store/auth';
import {
  listPrivateKeys,
  createPrivateKey,
  deletePrivateKey,
  downloadPrivateKeyPem,
} from '@/services/api/privatekey';
import {
  listTokens,
  createToken,
  deleteToken,
  type CreatedToken,
} from '@/services/api/token';

const TABS_LIST_CLASS =
  'h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0';
const TABS_TRIGGER_CLASS =
  'rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 pb-2 text-[12.5px] shadow-none data-[state=active]:border-phosphor data-[state=active]:bg-transparent data-[state=active]:text-phosphor data-[state=active]:shadow-none';

export default function SecurityPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId ?? '';

  return (
    <PageContainer>
      <Tabs defaultValue="keys">
        <TabsList className={TABS_LIST_CLASS}>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="keys">SSH Keys</TabsTrigger>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="tokens">API Tokens</TabsTrigger>
        </TabsList>
        <TabsContent value="keys" className="pt-6">
          <SshKeysSection wsId={wsId} />
        </TabsContent>
        <TabsContent value="tokens" className="pt-6">
          <ApiTokensSection wsId={wsId} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function SshKeysSection({ wsId }: { wsId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'generate' | 'paste'>('generate');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['private-keys', wsId],
    queryFn: () => listPrivateKeys(wsId),
    enabled: !!wsId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['private-keys', wsId] });

  const reset = () => {
    setName('');
    setDescription('');
    setPrivateKey('');
    setPublicKey('');
    setMode('generate');
  };

  const createMut = useMutation({
    mutationFn: () =>
      createPrivateKey(wsId, {
        name,
        description: description || undefined,
        generate: mode === 'generate',
        privateKey: mode === 'paste' ? privateKey : undefined,
        publicKey: mode === 'paste' && publicKey ? publicKey : undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      reset();
      toast.success('SSH key created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (keyId: string) => deletePrivateKey(keyId),
    onSuccess: async () => {
      await invalidate();
      toast.success('SSH key deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const downloadMut = useMutation({
    mutationFn: (keyId: string) => downloadPrivateKeyPem(keyId),
    onSuccess: () => toast.success('Private key downloaded'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to download'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="panel-title-slashes text-[12.5px] font-bold tracking-wide">SSH Keys</h2>
        <Modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <ModalTrigger asChild>
            <Button size="sm">Add SSH key</Button>
          </ModalTrigger>
          <ModalContent size="lg">
            <ModalHeader>
              <ModalTitle>Add SSH key</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <ModalDescription className="mb-4">
                Generate a new keypair or paste an existing private key.
              </ModalDescription>
              <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'generate' ? 'default' : 'outline'}
                  onClick={() => setMode('generate')}
                >
                  Generate new
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'paste' ? 'default' : 'outline'}
                  onClick={() => setMode('paste')}
                >
                  Paste existing
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-desc">Description</Label>
                <Input id="key-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {mode === 'paste' && (
                <>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="key-priv">Private key</Label>
                    <Textarea
                      id="key-priv"
                      rows={6}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      className="max-h-48 overflow-y-auto font-mono text-xs break-all [field-sizing:fixed]"
                      spellCheck={false}
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="key-pub">Public key (optional)</Label>
                    <Textarea
                      id="key-pub"
                      rows={2}
                      value={publicKey}
                      onChange={(e) => setPublicKey(e.target.value)}
                      placeholder="ssh-ed25519 AAAA..."
                      className="max-h-24 overflow-y-auto font-mono text-xs break-all [field-sizing:fixed]"
                      spellCheck={false}
                    />
                  </div>
                </>
              )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!name || (mode === 'paste' && !privateKey) || createMut.isPending}
              >
                Create
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>

      {isLoading ? (
        <div className="bg-accent h-32 animate-pulse rounded-lg" />
      ) : !data?.length ? (
        <EmptyState icon={KeyRound} title="No SSH keys yet" description="add an ssh key to connect your servers." />
      ) : (
        <Panel contentClassName="divide-y">
          {data.map((k) => (
            <div key={k.id} className="hover:bg-secondary flex min-w-0 items-start justify-between gap-4 px-4 py-3 transition-colors">
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="text-[12.5px] font-semibold">{k.name}</div>
                <div className="text-muted-foreground truncate font-mono text-[11px]">
                  {k.fingerprint ?? 'no fingerprint'}
                </div>
                {k.publicKey ? (
                  <div className="border-border bg-secondary mt-2 flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-1.5">
                    <code className="text-muted-foreground min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                      {k.publicKey}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground h-6 shrink-0 px-1.5"
                      onClick={() => {
                        navigator.clipboard?.writeText(k.publicKey ?? '');
                        toast.success('Public key copied');
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={downloadMut.isPending}
                  onClick={() => downloadMut.mutate(k.id)}
                >
                  <Download className="size-4" /> Download .pem
                </Button>
                <DeleteButton onConfirm={() => deleteMut.mutate(k.id)} label={k.name} />
              </div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function ApiTokensSection({ wsId }: { wsId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [newToken, setNewToken] = useState<CreatedToken | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tokens', wsId],
    queryFn: () => listTokens(wsId),
    enabled: !!wsId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tokens', wsId] });

  const createMut = useMutation({
    mutationFn: () => createToken(wsId, { name }),
    onSuccess: async (token) => {
      await invalidate();
      setNewToken(token);
      setName('');
      toast.success('Token created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (tokenId: string) => deleteToken(tokenId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Token deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <div className="space-y-4">
      <McpGuide />

      <div className="flex items-center justify-between">
        <h2 className="panel-title-slashes text-[12.5px] font-bold tracking-wide">API Tokens</h2>
        <Modal
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setName('');
              setNewToken(null);
            }
          }}
        >
          <ModalTrigger asChild>
            <Button size="sm">Create token</Button>
          </ModalTrigger>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Create API token</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <ModalDescription className="mb-4">
                {newToken
                  ? 'Copy your token now. You will not be able to see it again.'
                  : 'Give your token a descriptive name.'}
              </ModalDescription>
              {newToken ? (
                <Alert className="min-w-0">
                  <AlertTitle>Token created</AlertTitle>
                  <AlertDescription className="min-w-0">
                    <code className="block max-w-full break-all font-mono text-xs">{newToken.token}</code>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="token-name">Name</Label>
                  <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              {newToken ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      navigator.clipboard?.writeText(newToken.token);
                      toast.success('Copied to clipboard');
                    }}
                  >
                    Copy token
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
                    Create
                  </Button>
                </>
              )}
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>

      {isLoading ? (
        <div className="bg-accent h-32 animate-pulse rounded-lg" />
      ) : !data?.length ? (
        <EmptyState icon={Ticket} title="No API tokens yet" description="create a token to access the peon api." />
      ) : (
        <Panel contentClassName="divide-y">
          {data.map((t) => (
            <div key={t.id} className="hover:bg-secondary flex min-w-0 items-center justify-between gap-4 px-4 py-3 transition-colors">
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="truncate text-[12.5px] font-semibold">{t.name}</div>
                <div className="text-muted-foreground truncate text-[11px]">
                  created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ''}
                </div>
              </div>
              <div className="shrink-0">
                <DeleteButton onConfirm={() => deleteMut.mutate(t.id)} label={t.name} />
              </div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

/** Shows how to connect an MCP client using a workspace API token. */
function McpGuide() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const mcpUrl = `${origin}/mcp`;
  const config = `{
  "mcpServers": {
    "peon": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer peon_xxxxxxxx"
      }
    }
  }
}`;

  return (
    <DocCallout title="How do I connect an MCP client?">
      <p>
        API tokens also authenticate the hosted MCP server, so AI agents (Cursor, Claude, etc.) can
        manage projects and services, deploy and roll back, operate servers, manage env/volumes/tasks/backups,
        and more — with the same permissions as your role in this workspace. Point your MCP client at:
      </p>
      <div className="flex min-w-0 items-start gap-2">
        <code className="bg-secondary text-foreground min-w-0 flex-1 break-all rounded px-2 py-1 font-mono text-xs">
          {mcpUrl}
        </code>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            navigator.clipboard?.writeText(mcpUrl);
            toast.success('Copied');
          }}
        >
          Copy
        </Button>
      </div>
      <p>Send the token as a bearer header. Example client configuration (streamable HTTP):</p>
      <pre className="bg-secondary text-foreground max-w-full overflow-x-hidden rounded p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
        {config}
      </pre>
      <DocBullets>
        <li>
          The token is scoped to this workspace and inherits your role — members can only reach
          projects they were added to, and infrastructure tools require owner/admin.
        </li>
      </DocBullets>
    </DocCallout>
  );
}

function DeleteButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  return (
    <ConfirmButton
      onConfirm={onConfirm}
      title={`Delete "${label}"?`}
    >
      <Trash2 className="size-4" /> Delete
    </ConfirmButton>
  );
}
