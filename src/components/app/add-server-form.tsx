'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Check, KeyRound, CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createServer, type ProxyType, type ServerDetail } from '@/services/api/server';
import { listPrivateKeys, createPrivateKey } from '@/services/api/privatekey';

export interface AddServerFormProps {
  workspaceId: string;
  /** Preselected SSH key (e.g. the key just generated in the setup wizard). */
  defaultPrivateKeyId?: string;
  onCreated?: (server: ServerDetail) => void;
  /** When given, a Cancel button is rendered before the submit button. */
  onCancel?: () => void;
  /** Called when the user follows a link out of the form (Keys & Tokens). */
  onNavigateAway?: () => void;
  submitLabel?: string;
  /** Size of the Cancel / submit buttons. */
  actionSize?: 'sm' | 'default';
  /** Place the fields and the actions row. Defaults to fields followed by a right-aligned actions row. */
  renderLayout?: (fields: ReactNode, actions: ReactNode) => ReactNode;
}

/** "Add server" form: connect a host over SSH. Owns field state and the create mutation. */
export function AddServerForm({
  workspaceId: wsId,
  defaultPrivateKeyId,
  onCreated,
  onCancel,
  onNavigateAway,
  submitLabel = 'Add server',
  actionSize = 'default',
  renderLayout,
}: AddServerFormProps) {
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('root');
  const [privateKeyId, setPrivateKeyId] = useState(defaultPrivateKeyId ?? '');
  const [proxyType, setProxyType] = useState<ProxyType>('TRAEFIK');
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdPublicKey, setCreatedPublicKey] = useState<string | null>(null);
  const [copiedPub, setCopiedPub] = useState(false);

  const { data: keys } = useQuery({
    queryKey: ['private-keys', wsId],
    queryFn: () => listPrivateKeys(wsId),
    enabled: !!wsId,
  });

  const reset = () => {
    setName('');
    setIp('');
    setPort('22');
    setUser('root');
    setPrivateKeyId(defaultPrivateKeyId ?? '');
    setProxyType('TRAEFIK');
    setShowNewKey(false);
    setNewKeyName('');
    setCreatedPublicKey(null);
    setCopiedPub(false);
  };

  const createMut = useMutation({
    mutationFn: () =>
      createServer(wsId, {
        name,
        ip,
        port: Number(port) || 22,
        user,
        privateKeyId,
        proxyType,
      }),
    onSuccess: async (server) => {
      await qc.invalidateQueries({ queryKey: ['servers', wsId] });
      onCreated?.(server);
      reset();
      toast.success('Server added — checking connection…');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const createKeyMut = useMutation({
    mutationFn: () =>
      createPrivateKey(wsId, {
        name: newKeyName.trim() || `${name.trim() || 'server'}-ssh`,
        generate: true,
      }),
    onSuccess: async (key) => {
      await qc.invalidateQueries({ queryKey: ['private-keys', wsId] });
      setPrivateKeyId(key.id);
      setCreatedPublicKey(key.publicKey ?? null);
      setShowNewKey(false);
      setNewKeyName('');
      toast.success('SSH key generated — add the public key to the server before connecting');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create SSH key'),
  });

  const copyPublicKey = async () => {
    if (!createdPublicKey) return;
    try {
      await navigator.clipboard.writeText(createdPublicKey);
      setCopiedPub(true);
      toast.success('Public key copied');
      window.setTimeout(() => setCopiedPub(false), 2000);
    } catch {
      toast.error('Could not copy public key');
    }
  };

  const fields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="s-name">Name</Label>
        <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="s-user">User</Label>
        <Input id="s-user" value={user} onChange={(e) => setUser(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:col-span-2">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="s-ip">IP / Hostname</Label>
          <Input
            id="s-ip"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="203.0.113.10 or host.example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-port">Port</Label>
          <Input id="s-port" value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Label>SSH key</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="About SSH key"
                  >
                    <CircleHelp className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
                  Connect a Linux host over SSH. Peon needs an SSH key whose public half is
                  in the host&apos;s ~/.ssh/authorized_keys. After you add the server, open
                  it and click Connect to verify SSH and install the monitoring agent.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Link
            href="/keys-and-tokens"
            className="text-primary text-sm underline-offset-2 hover:underline"
            onClick={onNavigateAway}
          >
            MCP &amp; SSH keys → SSH Keys
          </Link>
        </div>
        {(keys?.length ?? 0) > 0 ? (
          <SearchableSelect
            value={privateKeyId}
            onValueChange={(id) => {
              setPrivateKeyId(id);
              setCreatedPublicKey(keys?.find((k) => k.id === id)?.publicKey ?? null);
            }}
            placeholder="Select SSH key"
            options={(keys ?? []).map((k) => ({ value: k.id, label: k.name }))}
          />
        ) : (
          <p className="text-muted-foreground border-border/60 rounded-md border px-3 py-2 text-sm">
            No SSH keys in this workspace yet. Generate one below, or create one under{' '}
            <Link
              href="/keys-and-tokens"
              className="text-primary underline-offset-2 hover:underline"
              onClick={onNavigateAway}
            >
              MCP &amp; SSH keys
            </Link>
            .
          </p>
        )}

        {!showNewKey ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              setShowNewKey(true);
              if (!newKeyName) setNewKeyName(name.trim() ? `${name.trim()}-ssh` : '');
            }}
          >
            <KeyRound className="size-3.5" /> Generate new SSH key
          </Button>
        ) : (
          <div className="border-border bg-secondary/40 space-y-3 rounded-md border p-3">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Creates an ed25519 keypair in this workspace and selects it for this server.
              Copy the public key onto the host before Connect.
            </p>
            <div className="space-y-2">
              <Label htmlFor="s-key-name">Key name</Label>
              <Input
                id="s-key-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="production-server"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => createKeyMut.mutate()}
                disabled={createKeyMut.isPending}
              >
                {createKeyMut.isPending ? 'Generating…' : 'Generate & use'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowNewKey(false);
                  setNewKeyName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {createdPublicKey ? (
          <div className="border-border bg-secondary space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Public key — add to server
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyPublicKey()}>
                {copiedPub ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copiedPub ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <code className="text-foreground block max-h-24 overflow-auto break-all font-mono text-xs leading-relaxed">
              {createdPublicKey}
            </code>
            <p className="text-muted-foreground text-sm leading-relaxed">
              On the host (as <span className="text-foreground/80">{user || 'root'}</span>):
              append this line to <code className="text-xs">~/.ssh/authorized_keys</code>,
              then continue with Add server → Connect.
            </p>
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Label>Gateway type</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="About gateway type"
                >
                  <CircleHelp className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
                Reverse proxy Peon installs on this server to route public HTTPS domains to
                your apps (Traefik by default). Choose None if you only need SSH access or
                private networking.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <SearchableSelect
          value={proxyType}
          onValueChange={(v) => setProxyType(v as ProxyType)}
          placeholder="Select gateway type"
          options={[
            { value: 'TRAEFIK', label: 'Traefik' },
            { value: 'CADDY', label: 'Caddy' },
            { value: 'NONE', label: 'None' },
          ]}
        />
      </div>
    </div>
  );

  const actions = (
    <>
      {onCancel ? (
        <Button size={actionSize} variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      <Button
        size={actionSize}
        onClick={() => createMut.mutate()}
        disabled={!name || !ip || !privateKeyId || createMut.isPending}
      >
        {submitLabel}
      </Button>
    </>
  );

  if (renderLayout) return <>{renderLayout(fields, actions)}</>;

  return (
    <div className="space-y-4">
      {fields}
      <div className="flex justify-end gap-2">{actions}</div>
    </div>
  );
}
