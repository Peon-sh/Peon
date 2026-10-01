'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, KeyRound, Plus, Ticket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { ConfirmButton } from '@/components/app/confirm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FormField, PageContainer, PageHeader, Panel } from '@/components/app/page';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { LocalDateTime } from '@/components/app/local-datetime';
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

const MODAL_FIELD = 'lg:grid-cols-1 lg:gap-2';

type Section = 'keys' | 'mcp' | 'tokens';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'keys', label: 'SSH keys' },
  { id: 'mcp', label: 'MCP' },
  { id: 'tokens', label: 'API keys' },
];

export default function SecurityPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId ?? '';
  const [section, setSection] = useState<Section>('keys');
  const [keyOpen, setKeyOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        title="MCP & SSH keys"
        description="SSH keys for servers, MCP access for AI agents, and API keys for the CLI"
        actions={
          section === 'keys' ? (
            <Button onClick={() => setKeyOpen(true)}>
              <Plus className="size-4" /> Add key
            </Button>
          ) : (
            <Button onClick={() => setTokenOpen(true)}>
              <Plus className="size-4" /> Create API key
            </Button>
          )
        }
      />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Sections" className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-left text-base whitespace-nowrap transition-colors',
                section === item.id
                  ? 'bg-secondary font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === 'keys' && <SshKeysSection wsId={wsId} open={keyOpen} setOpen={setKeyOpen} />}
          {section === 'mcp' && <McpGuide />}
          {section === 'tokens' && (
            <ApiTokensSection wsId={wsId} open={tokenOpen} setOpen={setTokenOpen} />
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function SshKeysSection({
  wsId,
  open,
  setOpen,
}: {
  wsId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const qc = useQueryClient();
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
    <>
      <Modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
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
              <FormField label="Name" htmlFor="key-name" className={MODAL_FIELD}>
                <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="Description" htmlFor="key-desc" className={MODAL_FIELD}>
                <Input id="key-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </FormField>
              {mode === 'paste' && (
                <>
                  <FormField label="Private key" htmlFor="key-priv" className={MODAL_FIELD}>
                    <Textarea
                      id="key-priv"
                      rows={6}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      className="max-h-48 overflow-y-auto font-mono text-xs break-all [field-sizing:fixed]"
                      spellCheck={false}
                    />
                  </FormField>
                  <FormField label="Public key (optional)" htmlFor="key-pub" className={MODAL_FIELD}>
                    <Textarea
                      id="key-pub"
                      rows={2}
                      value={publicKey}
                      onChange={(e) => setPublicKey(e.target.value)}
                      placeholder="ssh-ed25519 AAAA..."
                      className="max-h-24 overflow-y-auto font-mono text-xs break-all [field-sizing:fixed]"
                      spellCheck={false}
                    />
                  </FormField>
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
              Add key
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <DataTable
        columns={[
          { key: 'name', header: 'Name', cell: (k) => <span className="font-medium">{k.name}</span> },
          {
            key: 'fingerprint',
            header: 'Fingerprint',
            cell: (k) => (
              <span className="text-muted-foreground font-mono text-sm break-all">
                {k.fingerprint ?? 'No fingerprint'}
              </span>
            ),
          },
          {
            key: 'publicKey',
            header: 'Public key',
            className: 'max-w-xs',
            cell: (k) =>
              k.publicKey ? (
                <span className="flex min-w-0 items-center gap-1">
                  <code className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-sm">
                    {k.publicKey}
                  </code>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Copy public key"
                    onClick={() => {
                      navigator.clipboard?.writeText(k.publicKey ?? '');
                      toast.success('Public key copied');
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            key: 'created',
            header: 'Added',
            cell: (k) => <LocalDateTime value={k.createdAt} style="date" className="text-muted-foreground" />,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (k) => (
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={downloadMut.isPending}
                  onClick={() => downloadMut.mutate(k.id)}
                >
                  <Download className="size-4" /> Download .pem
                </Button>
                <DeleteButton onConfirm={() => deleteMut.mutate(k.id)} label={k.name} />
              </div>
            ),
          },
        ]}
        rows={data ?? []}
        rowKey={(k) => k.id}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={KeyRound}
            title="No SSH keys yet"
            description="Add an SSH key to connect your servers."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Add key
              </Button>
            }
          />
        }
      />
    </>
  );
}

function ApiTokensSection({
  wsId,
  open,
  setOpen,
}: {
  wsId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const qc = useQueryClient();
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
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Create API key</ModalTitle>
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
              <FormField label="Name" htmlFor="token-name" className={MODAL_FIELD}>
                <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
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
                  Create API key
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <DataTable
        columns={[
          { key: 'name', header: 'Name', cell: (t) => <span className="font-medium">{t.name}</span> },
          {
            key: 'created',
            header: 'Created',
            cell: (t) => <LocalDateTime value={t.createdAt} style="date" className="text-muted-foreground" />,
          },
          {
            key: 'lastUsed',
            header: 'Last used',
            cell: (t) =>
              t.lastUsedAt ? (
                <LocalDateTime value={t.lastUsedAt} style="date" className="text-muted-foreground" />
              ) : (
                <span className="text-muted-foreground">Never</span>
              ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (t) => <DeleteButton onConfirm={() => deleteMut.mutate(t.id)} label={t.name} />,
          },
        ]}
        rows={data ?? []}
        rowKey={(t) => t.id}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={Ticket}
            title="No API keys yet"
            description="Create a token to access the Peon API."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Create API key
              </Button>
            }
          />
        }
      />
    </div>
  );
}

/** Shows how to connect an MCP client using a workspace API key. */
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
    <Panel
      title="Connect an MCP client"
      description="Let AI agents such as Cursor or Claude manage this workspace through the hosted MCP server."
      contentClassName="space-y-4 p-4 text-base"
    >
      <p className="text-muted-foreground">
        API keys also authenticate the MCP server, so agents can manage projects and services,
        deploy and roll back, operate servers, and manage env, volumes, tasks and backups with the
        same permissions as your role in this workspace. Point your MCP client at:
      </p>
      <div className="flex min-w-0 items-start gap-2">
        <code className="bg-secondary text-foreground min-w-0 flex-1 break-all rounded-md px-2 py-1 font-mono text-xs">
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
      <p className="text-muted-foreground">
        Send an API key as a bearer header. Create one under API keys. Example client
        configuration (streamable HTTP):
      </p>
      <pre className="bg-secondary text-foreground max-w-full overflow-x-hidden rounded-md p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
        {config}
      </pre>
      <p className="text-muted-foreground">
        The key is scoped to this workspace and inherits your role: members can only reach projects
        they were added to, and infrastructure tools require owner or admin.
      </p>
    </Panel>
  );
}

function DeleteButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  return (
    <ConfirmButton
      onConfirm={onConfirm}
      title={`Delete "${label}"?`}
      variant="ghost"
    >
      <Trash2 className="size-4" /> Delete
    </ConfirmButton>
  );
}
