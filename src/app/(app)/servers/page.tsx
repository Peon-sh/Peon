'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Server, ArrowRight, Copy, Check, KeyRound, CircleHelp } from 'lucide-react';
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
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { PageContainer } from '@/components/app/page';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { useAuthStore } from '@/store/auth';
import { listServers, createServer, type ProxyType } from '@/services/api/server';
import { listPrivateKeys, createPrivateKey } from '@/services/api/privatekey';

export default function ServersPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId ?? '';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('root');
  const [privateKeyId, setPrivateKeyId] = useState('');
  const [proxyType, setProxyType] = useState<ProxyType>('TRAEFIK');
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdPublicKey, setCreatedPublicKey] = useState<string | null>(null);
  const [copiedPub, setCopiedPub] = useState(false);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers', wsId],
    queryFn: () => listServers(wsId),
    enabled: !!wsId,
  });

  const { data: keys } = useQuery({
    queryKey: ['private-keys', wsId],
    queryFn: () => listPrivateKeys(wsId),
    enabled: !!wsId && open,
  });

  const reset = () => {
    setName('');
    setIp('');
    setPort('22');
    setUser('root');
    setPrivateKeyId('');
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
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['servers', wsId] });
      setOpen(false);
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

  const createDialog = (
    <Modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>Add server</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <ModalDescription className="mb-4">
            Connect a Linux host over SSH to deploy and manage services.
          </ModalDescription>
          <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="s-name">Name</Label>
                <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="s-ip">IP / Hostname</Label>
                  <Input
                    id="s-ip"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder="203.0.113.10 or host.example.com"
                  />
                  <p className="text-muted-foreground text-xs">
                    IPv4, IPv6, or DNS hostname.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-port">Port</Label>
                  <Input id="s-port" value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-user">User</Label>
                <Input id="s-user" value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div className="space-y-2">
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
                    className="text-phosphor text-[11px] underline-offset-2 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    Keys &amp; Tokens → SSH Keys
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
                  <p className="text-muted-foreground border-border/60 rounded-md border border-dashed px-3 py-2 text-xs">
                    No SSH keys in this workspace yet. Generate one below, or create one under{' '}
                    <Link
                      href="/keys-and-tokens"
                      className="text-phosphor underline-offset-2 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      Keys &amp; Tokens
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
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
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
                  <div className="border-border bg-[#0a0f0c] space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
                        Public key — add to server
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copyPublicKey()}>
                        {copiedPub ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copiedPub ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    <code className="text-phosphor/90 block max-h-24 overflow-auto break-all font-mono text-[10.5px] leading-relaxed">
                      {createdPublicKey}
                    </code>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      On the host (as <span className="text-foreground/80">{user || 'root'}</span>):
                      append this line to{' '}
                      <code className="text-[10.5px]">~/.ssh/authorized_keys</code>, then continue
                      with Add server → Connect.
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
        </ModalBody>
        <ModalFooter>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => createMut.mutate()}
            disabled={!name || !ip || !privateKeyId || createMut.isPending}
          >
            Add server
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return (
    <PageContainer>
      {createDialog}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-accent h-40 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !servers?.length ? (
        <EmptyState
          icon={Server}
          title="No servers yet"
          description="add a linux host over ssh — you’ll need an ssh key (generate one in the form or under Keys & Tokens)."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add server
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {servers.map((s) => {
            const status = !s.isReachable
              ? { label: 'Offline', tone: 'destructive' as const }
              : s.isUsable
                ? { label: 'Ready', tone: 'success' as const }
                : { label: 'Needs setup', tone: 'warning' as const };
            const domain = s.settings?.wildcardDomain?.trim() || null;

            return (
              <Link key={s.id} href={`/servers/${s.id}`} className="group">
                <div className="bg-card hover:border-border-bright hover:bg-secondary flex h-full flex-col rounded-lg border p-4 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <span className="border-border-bright bg-secondary text-phosphor grid size-9 place-items-center rounded-md border">
                      <Server className="size-4" />
                    </span>
                    <StatusBadge status={status.label} tone={status.tone} />
                  </div>
                  <div className="mt-3 min-w-0 space-y-1">
                    <p className="font-heading truncate font-bold">{s.name}</p>
                    <p className="text-muted-foreground truncate text-[11px]">{s.ip}</p>
                  </div>
                  <div className="text-muted-foreground mt-3 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span>user</span>
                      <span className="text-foreground/80 truncate font-medium">{s.user}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>port</span>
                      <span className="text-foreground/80 font-medium">{s.port}</span>
                    </div>
                    {domain ? (
                      <div className="flex items-center justify-between gap-2">
                        <span>domain</span>
                        <span className="text-foreground/80 truncate font-medium">{domain}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-auto flex items-center justify-end pt-3">
                    <ArrowRight className="text-faint size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                </div>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-border-bright text-muted-foreground hover:text-phosphor hover:border-phosphor-dim grid min-h-40 place-items-center rounded-lg border border-dashed transition-colors"
          >
            <span className="flex flex-col items-center gap-2 text-[12.5px]">
              <Plus className="size-4" /> add server
            </span>
          </button>
        </div>
      )}
    </PageContainer>
  );
}
