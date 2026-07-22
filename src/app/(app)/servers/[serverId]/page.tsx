'use client';

import { use, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, Check, ChevronRight, HardDrive, LoaderCircle, Terminal, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PageContainer, Panel } from '@/components/app/page';
import { DocCallout } from '@/components/app/doc-callout';
import { StatusBadge } from '@/components/app/status-badge';
import {
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/app/modal';
import {
  getServer,
  updateServer,
  deleteServer,
  validateServer,
  proxyAction,
  cleanupServer,
  listServerLogs,
  createDestination,
  deleteDestination,
  type ServerDetail,
  type ServerOperationLog,
} from '@/services/api/server';
import { listPrivateKeys } from '@/services/api/privatekey';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { SshTerminal } from '@/components/terminal/ssh-terminal';
import { ConfirmButton } from '@/components/app/confirm';
import { LocalDateTime } from '@/components/app/local-datetime';

const TABS_LIST_CLASS =
  'h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0';
const TABS_TRIGGER_CLASS =
  'rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 pb-2 text-[12.5px] shadow-none data-[state=active]:border-phosphor data-[state=active]:bg-transparent data-[state=active]:text-phosphor data-[state=active]:shadow-none';

export default function ServerDetailPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = use(params);
  const qc = useQueryClient();
  const [tab, setTab] = useState('general');

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => getServer(serverId),
    refetchInterval: (q) =>
      q.state.data?.settings?.isSentinelEnabled ? 30_000 : false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['server', serverId] });

  if (isLoading || !server) {
    return (
      <PageContainer>
        <div className="bg-accent h-20 animate-pulse rounded-lg" />
        <div className="bg-accent h-64 animate-pulse rounded-lg" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
        <TabsList className={TABS_LIST_CLASS}>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="general">General</TabsTrigger>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="proxy">Gateway</TabsTrigger>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="terminal">Terminal</TabsTrigger>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="advanced">Advanced</TabsTrigger>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="destinations">Destinations</TabsTrigger>
          <TabsTrigger className={TABS_TRIGGER_CLASS} value="danger">Danger</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-6">
          <TabWithActivity serverId={server.id}>
            <GeneralTab key={server.id} server={server} onSaved={invalidate} />
          </TabWithActivity>
        </TabsContent>
        <TabsContent value="proxy" className="pt-6">
          <TabWithActivity serverId={server.id}>
            <ProxyTab server={server} onChanged={invalidate} />
          </TabWithActivity>
        </TabsContent>
        <TabsContent value="terminal" className="pt-6">
          <ServerTerminalTab serverId={server.id} />
        </TabsContent>
        <TabsContent value="advanced" className="pt-6">
          <TabWithActivity serverId={server.id}>
            <AdvancedTab server={server} onSaved={invalidate} />
          </TabWithActivity>
        </TabsContent>
        <TabsContent value="destinations" className="pt-6">
          <DestinationsTab server={server} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="danger" className="pt-6">
          <DangerTab server={server} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function TabWithActivity({
  serverId,
  children,
}: {
  serverId: string;
  children: ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">{children}</div>
      <ServerActivityPanel serverId={serverId} />
    </div>
  );
}

function GeneralTab({ server, onSaved }: { server: ServerDetail; onSaved: () => void }) {
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? '');
  const [ip, setIp] = useState(server.ip);
  const [port, setPort] = useState(String(server.port));
  const [user, setUser] = useState(server.user);
  const [privateKeyId, setPrivateKeyId] = useState(server.privateKeyId ?? '');
  const [wildcardDomain, setWildcardDomain] = useState(server.settings?.wildcardDomain ?? '');
  const [proxyType, setProxyType] = useState(server.proxyType);
  const [connectionTimeout, setConnectionTimeout] = useState(String(server.settings?.connectionTimeout ?? 30));

  const { data: keys } = useQuery({
    queryKey: ['private-keys', workspaceId],
    queryFn: () => listPrivateKeys(workspaceId!),
    enabled: !!workspaceId,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      updateServer(server.id, {
        name,
        description: description || null,
        ip,
        port: Number(port) || 22,
        user,
        privateKeyId: privateKeyId || null,
        proxyType,
        wildcardDomain: wildcardDomain || null,
        connectionTimeout: Number(connectionTimeout) || 30,
      }),
    onSuccess: async () => {
      onSaved();
      toast.success('Server updated');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const connectMut = useMutation({
    mutationFn: () =>
      validateServer(server.id, {
        ip,
        port: Number(port) || 22,
        user,
        privateKeyId: privateKeyId || null,
        connectionTimeout: Number(connectionTimeout) || 30,
      }),
    onSuccess: () => {
      onSaved();
      toast.success(
        server.isUsable
          ? 'Reconnect to server started. Watch activity for live logs.'
          : 'Connect to server started. Watch activity for live logs.',
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const metrics = server.settings?.agentHostMetrics;
  const agentLive = server.settings?.isAgentLive === true;
  const cpu = metrics?.cpu_percent;
  const mem = metrics?.memory_percent;
  const disk = metrics?.disk_percent_root;
  const free = disk != null ? Math.max(0, 100 - disk) : null;
  const containerCount = server.settings?.agentContainers?.length;

  return (
    <div className="space-y-5">
      <div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="CPU"
            value={cpu != null ? `${Math.round(cpu)}%` : '—'}
            detail={agentLive ? 'from peon-ping-pong' : 'waiting for agent'}
            pct={cpu ?? 0}
          />
          <MetricCard
            label="RAM"
            value={mem != null ? `${Math.round(mem)}%` : '—'}
            detail={agentLive ? 'from peon-ping-pong' : 'waiting for agent'}
            pct={mem ?? 0}
          />
          <MetricCard
            label="Disk used"
            value={disk != null ? `${Math.round(disk)}%` : '—'}
            detail={
              agentLive
                ? containerCount != null
                  ? `${containerCount} containers`
                  : 'from peon-ping-pong'
                : 'waiting for agent'
            }
            pct={disk ?? 0}
          />
          <MetricCard
            label="Free space"
            value={free != null ? `${Math.round(free)}%` : '—'}
            detail={agentLive ? 'root filesystem' : 'waiting for agent'}
            pct={free ?? 0}
            invert
          />
        </div>
      </div>

      <Panel
        title="connection"
        contentClassName="space-y-3 p-3"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-[11px]">
              {connectMut.isPending
                ? 'Saving & connecting…'
                : 'Saves host settings, then connects · progress in Activity'}
            </span>
            <Button
              size="sm"
              onClick={() => connectMut.mutate()}
              disabled={connectMut.isPending || !privateKeyId}
            >
              {server.isReachable ? 'Reconnect to server' : 'Connect to server'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <ConnectionStep
            icon={Terminal}
            label="SSH"
            status={server.isReachable ? 'Online' : 'Offline'}
            about={
              server.isReachable
                ? 'Session to this host works.'
                : 'Check IP, port, and key.'
            }
            tone={server.isReachable ? 'success' : 'destructive'}
          />
          <ConnectionStepConnector />
          <ConnectionStep
            icon={HardDrive}
            label="Setup"
            status={server.isUsable ? 'Ready' : 'Needed'}
            about={
              server.isUsable
                ? 'Docker ready for deploys.'
                : 'Connect to finish install.'
            }
            tone={server.isUsable ? 'success' : 'muted'}
          />
          <ConnectionStepConnector />
          <ConnectionStep
            icon={Activity}
            label="Agent"
            status={
              agentLive
                ? 'Live'
                : server.settings?.isSentinelEnabled
                  ? 'Waiting'
                  : 'Not installed'
            }
            about={
              agentLive
                ? 'Sending host metrics.'
                : server.settings?.isSentinelEnabled
                  ? 'No recent heartbeat.'
                  : 'Installs on Connect.'
            }
            tone={agentLive ? 'success' : server.settings?.isSentinelEnabled ? 'warning' : 'muted'}
          />
        </div>
        <div className="text-muted-foreground flex items-center gap-2 border-t border-dashed pt-2.5 text-[11px]">
          <Activity className="size-3 shrink-0 opacity-60" />
          <span>
            Last heartbeat{' '}
            <span className="text-foreground/85 font-medium tabular-nums">
              {server.settings?.agentLastSeenAt ? (
                <LocalDateTime value={server.settings.agentLastSeenAt} />
              ) : (
                '—'
              )}
            </span>
          </span>
        </div>
      </Panel>

      <Panel
        title="general"
        contentClassName="grid gap-4 p-4 sm:grid-cols-2"
        footer={
          <Button
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={!privateKeyId || saveMut.isPending}
          >
            Save changes
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="g-name">Name</Label>
          <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="g-description">Description</Label>
          <Input id="g-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="g-user">User</Label>
          <Input id="g-user" value={user} onChange={(e) => setUser(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="g-ip">IP / Hostname</Label>
          <Input
            id="g-ip"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="203.0.113.10, 2001:db8::1, or host.example.com"
          />
          <p className="text-muted-foreground text-[11px]">
            IPv4, IPv6, or DNS hostname — passed straight to SSH.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="g-port">Port</Label>
          <Input id="g-port" value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>SSH key</Label>
          <SearchableSelect
            value={privateKeyId}
            onValueChange={setPrivateKeyId}
            placeholder="Select SSH key"
            options={[
              ...(keys ?? []).map((k) => ({ value: k.id, label: k.name })),
              ...(privateKeyId && !keys?.some((k) => k.id === privateKeyId) && server.privateKey
                ? [{ value: server.privateKey.id, label: server.privateKey.name }]
                : []),
            ]}
          />
          {!keys?.length ? (
            <p className="text-muted-foreground text-[11px]">
              No SSH keys yet.{' '}
              <Link href="/keys-and-tokens" className="text-phosphor underline-offset-2 hover:underline">
                Add one under Keys & Tokens
              </Link>
              .
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="g-wildcard">Wildcard domain</Label>
          <Input
            id="g-wildcard"
            placeholder="https://example.com"
            value={wildcardDomain}
            onChange={(e) => setWildcardDomain(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="g-timeout">SSH connection timeout (s)</Label>
          <Input
            id="g-timeout"
            value={connectionTimeout}
            onChange={(e) => setConnectionTimeout(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Gateway type</Label>
          <SearchableSelect
            value={proxyType}
            onValueChange={(v) => setProxyType(v as ServerDetail['proxyType'])}
            placeholder="Select gateway type"
            options={[
              { value: 'TRAEFIK', label: 'Traefik' },
              { value: 'CADDY', label: 'Caddy' },
              { value: 'NONE', label: 'None' },
            ]}
          />
          <p className="text-muted-foreground text-[11px]">
            Reverse proxy Peon installs on this server to route public HTTPS to your apps. Choose{' '}
            <span className="text-foreground/80">None</span> if you only need SSH / private networks.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function AdvancedTab({ server, onSaved }: { server: ServerDetail; onSaved: () => void }) {
  const qc = useQueryClient();
  const [forceDockerCleanup, setForceDockerCleanup] = useState(server.settings?.forceDockerCleanup ?? false);
  const [deleteUnusedVolumes, setDeleteUnusedVolumes] = useState(server.settings?.deleteUnusedVolumes ?? false);
  const [deleteUnusedNetworks, setDeleteUnusedNetworks] = useState(server.settings?.deleteUnusedNetworks ?? false);
  const [concurrentBuilds, setConcurrentBuilds] = useState(String(server.settings?.concurrentBuilds ?? 2));
  const [deploymentQueueLimit, setDeploymentQueueLimit] = useState(String(server.settings?.deploymentQueueLimit ?? 25));
  const [dockerCleanupFrequency, setDockerCleanupFrequency] = useState(server.settings?.dockerCleanupFrequency ?? '0 0 * * *');
  const [dockerCleanupThreshold, setDockerCleanupThreshold] = useState(String(server.settings?.dockerCleanupThreshold ?? 80));

  const saveMut = useMutation({
    mutationFn: () =>
      updateServer(server.id, {
        forceDockerCleanup,
        deleteUnusedVolumes,
        deleteUnusedNetworks,
        concurrentBuilds: Number(concurrentBuilds) || 2,
        deploymentQueueLimit: Number(deploymentQueueLimit) || 25,
        dockerCleanupFrequency,
        dockerCleanupThreshold: Number(dockerCleanupThreshold) || 80,
      }),
    onSuccess: async () => {
      onSaved();
      toast.success('Advanced server settings saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const cleanupMut = useMutation({
    mutationFn: () => cleanupServer(server.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['server-logs', server.id] });
      toast.success('Cleanup started. Watch activity for live logs.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const savedVolumes = server.settings?.deleteUnusedVolumes ?? false;
  const savedNetworks = server.settings?.deleteUnusedNetworks ?? false;

  const saveFooter = (
    <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
      Save advanced settings
    </Button>
  );

  return (
    <div className="space-y-6">
      <Panel
        title="build and deployment limits"
        contentClassName="grid gap-4 p-4 sm:grid-cols-2"
        footer={saveFooter}
      >
        <NumberField label="Concurrent builds" value={concurrentBuilds} onChange={setConcurrentBuilds} />
        <NumberField label="Deployment queue limit" value={deploymentQueueLimit} onChange={setDeploymentQueueLimit} />
      </Panel>

      <Panel
        title="docker cleanup"
        contentClassName="space-y-4 p-4"
        footer={
          <>
            <ConfirmButton
              title="Trigger Docker cleanup?"
              description={
                <>
                  This will prune unused images, builders, and stopped containers on this server.
                  {savedVolumes
                    ? ' Unused volumes will also be deleted.'
                    : ' Unused volumes are kept (toggle is off in saved settings).'}
                  {savedNetworks
                    ? ' Unused networks will also be deleted.'
                    : ' Unused networks are kept (toggle is off in saved settings).'}{' '}
                  Save advanced settings first if you changed the volume/network toggles.
                </>
              }
              confirmLabel="Trigger cleanup"
              variant="outline"
              confirmVariant="default"
              size="sm"
              disabled={cleanupMut.isPending}
              onConfirm={() => cleanupMut.mutate()}
            >
              {cleanupMut.isPending ? 'Starting…' : 'Trigger manual cleanup'}
            </ConfirmButton>
            {saveFooter}
          </>
        }
      >
        <ToggleRow
          label="Force Docker cleanup"
          description="When enabled, scheduled cleanups always prune unused images, builders, and containers. When disabled, cleanup only runs if disk usage meets the threshold below."
          checked={forceDockerCleanup}
          onCheckedChange={setForceDockerCleanup}
          compact
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="cleanup-frequency">Cleanup cron</Label>
            <Input
              id="cleanup-frequency"
              value={dockerCleanupFrequency}
              onChange={(e) => setDockerCleanupFrequency(e.target.value)}
            />
          </div>
          {!forceDockerCleanup ? (
            <NumberField
              label="Cleanup threshold (%)"
              value={dockerCleanupThreshold}
              onChange={setDockerCleanupThreshold}
            />
          ) : (
            <div />
          )}
          <div className="space-y-3 pt-6">
            <ToggleRow
              label="Delete unused volumes"
              description="Permanently removes volumes not attached to running containers. Data from stopped containers can be lost."
              checked={deleteUnusedVolumes}
              onCheckedChange={setDeleteUnusedVolumes}
              compact
            />
            <ToggleRow
              label="Delete unused networks"
              description="Removes networks not attached to running containers. Can break connectivity for stopped workloads."
              checked={deleteUnusedNetworks}
              onCheckedChange={setDeleteUnusedNetworks}
              compact
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ServerTerminalTab({ serverId }: { serverId: string }) {
  return <SshTerminal serverId={serverId} />;
}

function ProxyTab({ server, onChanged }: { server: ServerDetail; onChanged: () => void }) {
  const actionMut = useMutation({
    mutationFn: (action: 'start' | 'stop' | 'restart') => proxyAction(server.id, action),
    onSuccess: async (_res, action) => {
      onChanged();
      const label =
        action === 'stop' ? 'Turning off gateway' : action === 'restart' ? 'Reloading gateway' : 'Turning on gateway';
      toast.success(`${label}. Watch activity for live logs.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const gatewayName =
    server.proxyType === 'CADDY' ? 'Caddy' : server.proxyType === 'NONE' ? null : 'Traefik';
  const isOn = server.proxyStatus === 'running';

  return (
    <div className="space-y-4">
      <Panel
        title="traffic gateway"
        contentClassName="space-y-4 p-4"
        footer={
          server.proxyType !== 'NONE' ? (
            <>
              <Button
                size="sm"
                onClick={() => actionMut.mutate('start')}
                disabled={actionMut.isPending || isOn}
              >
                Turn on
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actionMut.mutate('restart')}
                disabled={actionMut.isPending || !isOn}
              >
                Reload
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actionMut.mutate('stop')}
                disabled={actionMut.isPending || !isOn}
              >
                Turn off
              </Button>
            </>
          ) : undefined
        }
      >
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          {gatewayName
            ? `The gateway (${gatewayName}) receives public HTTPS traffic and routes each domain to the right app container. Peon installs and manages it on this server.`
            : 'No gateway is configured for this server. Change Gateway type under General if you want public HTTPS routing.'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-[12px]">Status</span>
          <StatusBadge
            status={isOn ? 'on' : server.proxyStatus === 'exited' ? 'off' : server.proxyStatus}
            tone={isOn ? 'success' : 'muted'}
          />
          {gatewayName ? (
            <span className="text-muted-foreground text-[11px]">{gatewayName}</span>
          ) : null}
        </div>

        <div className="text-muted-foreground space-y-1 text-[11px]">
          <p>
            <span className="text-foreground/80 font-medium">Turn on</span> — install/start the gateway so domains can reach your apps.
          </p>
          <p>
            <span className="text-foreground/80 font-medium">Reload</span> — restart the gateway with the current config (brief blip possible).
          </p>
          <p>
            <span className="text-foreground/80 font-medium">Turn off</span> — stop public routing on this server (apps keep running locally).
          </p>
        </div>
      </Panel>
    </div>
  );
}

function DestinationsTab({ server, onChanged }: { server: ServerDetail; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [network, setNetwork] = useState('peon');

  const createMut = useMutation({
    mutationFn: () => createDestination(server.id, { name, network }),
    onSuccess: async () => {
      onChanged();
      setName('');
      setNetwork('peon');
      toast.success('Destination added');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (destId: string) => deleteDestination(server.id, destId),
    onSuccess: async () => {
      onChanged();
      toast.success('Destination deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <div className="space-y-4">
      <DocCallout title="What is a destination?">
        <p>
          A destination is a Docker network on this server where your apps are deployed. The server is the machine;
          the destination is which network those containers join so they can talk to each other and to the traffic gateway.
        </p>
        <p>
          Every server starts with a <span className="text-foreground font-medium">default</span> destination
          (network <span className="text-foreground font-mono text-[11px]">peon</span>). Add another if you need an
          isolated network for a separate set of services.
        </p>
        <div className="border-phosphor-dim/60 bg-background/40 rounded-md border px-3 py-2.5">
          <div className="text-phosphor mb-1 text-[10px] font-medium tracking-wide uppercase">Example</div>
          <p>
            Deploy your marketing site and API on the <span className="text-foreground font-medium">default</span>{' '}
            destination so they share the <span className="font-mono text-[11px]">peon</span> network with the gateway.
            Create a second destination named <span className="text-foreground font-medium">staging</span> with
            network <span className="font-mono text-[11px]">peon-staging</span> for preview apps that should stay
            isolated from production containers on the same server.
          </p>
        </div>
      </DocCallout>

      <Panel
        title="add destination"
        contentClassName="grid gap-4 p-4 sm:grid-cols-2"
        footer={
          <Button size="sm" onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            Add
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="d-name">Name</Label>
          <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. staging" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="d-network">Docker network</Label>
          <Input id="d-network" value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="peon" />
        </div>
      </Panel>

      {server.destinations.length ? (
        <Panel title="destinations" contentClassName="divide-y">
          {server.destinations.map((d) => (
            <div key={d.id} className="hover:bg-secondary flex items-center justify-between gap-4 px-4 py-3 transition-colors">
              <div>
                <div className="text-[12.5px] font-semibold">{d.name}</div>
                <div className="text-muted-foreground text-[11px]">network: {d.network}</div>
              </div>
              <ConfirmButton
                title={`Delete destination "${d.name}"?`}
                description={`Removes this destination (Docker network ${d.network}) from Peon. Services still using it may need to be reassigned.`}
                confirmLabel="Delete"
                size="sm"
                disabled={deleteMut.isPending}
                onConfirm={() => deleteMut.mutate(d.id)}
              >
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            </div>
          ))}
        </Panel>
      ) : (
        <p className="text-muted-foreground border-border-bright rounded-lg border border-dashed px-4 py-8 text-center text-[12.5px]">
          No destinations yet.
        </p>
      )}
    </div>
  );
}

function DangerTab({ server }: { server: ServerDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmName, setConfirmName] = useState('');
  const [deleteResources, setDeleteResources] = useState(false);

  // Fresh count when opening Danger — avoids stale React Query payloads from before resourceCount existed.
  const { data: live } = useQuery({
    queryKey: ['server', server.id, 'danger'],
    queryFn: () => getServer(server.id),
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const resourceCount = live?.resourceCount ?? live?._count?.services ?? server.resourceCount ?? server._count?.services ?? 0;
  const nameMatches = confirmName.trim() === server.name;
  const canDelete = nameMatches && (resourceCount === 0 || deleteResources);

  const deleteMut = useMutation({
    mutationFn: () =>
      deleteServer(server.id, {
        confirmName: confirmName.trim(),
        deleteResources: resourceCount > 0 ? deleteResources : false,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Server deleted');
      router.push('/servers');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Panel
      title={<span className="text-destructive">delete server</span>}
      className="border-destructive/40"
      contentClassName="space-y-4 p-4"
      footer={
        <Modal
          onOpenChange={(open) => {
            if (!open) {
              setConfirmName('');
              setDeleteResources(false);
            }
          }}
        >
          <ModalTrigger asChild>
            <Button size="sm" variant="destructive">
              <Trash2 className="size-4" /> Delete server
            </Button>
          </ModalTrigger>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Delete &quot;{server.name}&quot;?</ModalTitle>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <ModalDescription>
                This removes the server from Peon. Type the server name to confirm.
              </ModalDescription>
              <div className="space-y-2">
                <Label htmlFor="confirm-server-name">Server name</Label>
                <Input
                  id="confirm-server-name"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={server.name}
                  autoComplete="off"
                />
              </div>
              {resourceCount > 0 ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={deleteResources}
                    onCheckedChange={(v) => setDeleteResources(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Delete all resources ({resourceCount} total)
                    <span className="text-muted-foreground mt-0.5 block text-[12px]">
                      Stops containers on the host and deletes those services from Peon. Without this,
                      the server cannot be deleted.
                    </span>
                  </span>
                </label>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <ModalClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </ModalClose>
              <Button
                type="button"
                variant="destructive"
                disabled={!canDelete || deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                Delete server
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      }
    >
      <p className="text-muted-foreground text-sm">
        Permanently remove this server from Peon
        {resourceCount > 0
          ? `, including the option to delete its ${resourceCount} service${resourceCount === 1 ? '' : 's'} and stop their containers`
          : ''}
        . This does not destroy the remote machine itself.
      </p>
      {resourceCount > 0 ? (
        <p className="text-amber-600 dark:text-amber-400 text-[12.5px]">
          This server has {resourceCount} resource{resourceCount === 1 ? '' : 's'}. You must confirm
          deleting them in the dialog before the server can be removed.
        </p>
      ) : (
        <p className="text-muted-foreground text-[12.5px]">
          No services are placed on this server, so it can be deleted after name confirmation.
        </p>
      )}
    </Panel>
  );
}

function MetricCard({
  label,
  value,
  detail,
  pct,
  invert,
}: {
  label: string;
  value: string;
  detail: string;
  pct: number;
  /** When true, higher free % is good (green bias). */
  invert?: boolean;
}) {
  const tone =
    invert
      ? pct < 15
        ? 'bg-destructive'
        : pct < 30
          ? 'bg-amber-500'
          : 'bg-phosphor'
      : pct >= 90
        ? 'bg-destructive'
        : pct >= 75
          ? 'bg-amber-500'
          : 'bg-phosphor';

  return (
    <div className="border-border/80 bg-card rounded-lg border px-3 py-3">
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</div>
      <div className="mt-1 text-[18px] font-semibold tracking-tight">{value}</div>
      <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="text-muted-foreground mt-1.5 text-[10px]">{detail}</div>
    </div>
  );
}

const CONNECTION_TONE = {
  success: {
    card: 'border-success/25 bg-success/5',
    icon: 'bg-success/15 text-success',
    label: 'text-success',
  },
  warning: {
    card: 'border-warning/25 bg-warning/5',
    icon: 'bg-warning/15 text-warning',
    label: 'text-warning',
  },
  destructive: {
    card: 'border-destructive/25 bg-destructive/5',
    icon: 'bg-destructive/15 text-destructive',
    label: 'text-destructive',
  },
  muted: {
    card: 'border-border/70 bg-secondary/40',
    icon: 'bg-muted text-muted-foreground',
    label: 'text-muted-foreground',
  },
} as const;

function ConnectionStep({
  icon: Icon,
  label,
  status,
  about,
  tone,
}: {
  icon: typeof Terminal;
  label: string;
  status: string;
  about: string;
  tone: keyof typeof CONNECTION_TONE;
}) {
  const styles = CONNECTION_TONE[tone];
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-start gap-2.5 rounded-md border px-2.5 py-2',
        styles.card,
      )}
    >
      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md', styles.icon)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {label}
        </div>
        <div className={cn('text-[12.5px] font-semibold leading-tight', styles.label)}>{status}</div>
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{about}</p>
      </div>
    </div>
  );
}

function ConnectionStepConnector() {
  return (
    <div className="text-muted-foreground/40 hidden shrink-0 items-center sm:flex" aria-hidden>
      <ChevronRight className="size-4" />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  compact,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4', compact ? 'py-0' : 'px-4 py-3')}>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold">{label}</div>
        {description ? <div className="text-muted-foreground text-[11px]">{description}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ServerActivityPanel({ serverId }: { serverId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['server-logs', serverId],
    queryFn: () => listServerLogs(serverId),
    refetchInterval: 2000,
  });

  // Newest first so the latest step is visible without scrolling.
  const ordered = [...logs].reverse();
  const latest = logs[logs.length - 1];
  const runStartedAt = latest
    ? logs.find((l) => l.sessionId === latest.sessionId)?.createdAt ?? logs[0]?.createdAt
    : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [latest?.id, ordered.length]);

  return (
    <aside className="flex w-full min-h-0 flex-col xl:sticky xl:top-0 xl:self-start">
      <Panel
        title="activity"
        className="flex h-[min(70vh,calc(100svh-8rem))] min-h-0 flex-col xl:h-[calc(100svh-3rem-3rem)]"
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <div className="shrink-0 border-b px-4 py-2.5">
          <div className="font-heading text-[13px] font-bold">
            {latest ? operationTitle(latest.operation) : 'No operation yet'}
          </div>
          {runStartedAt ? (
            <div className="text-muted-foreground mt-0.5 text-[11px]">
              Latest run started <LocalDateTime value={runStartedAt} style="time" />
              <span className="text-muted-foreground/70"> · newest first</span>
            </div>
          ) : null}
        </div>
        <div ref={scrollRef} className="bg-background/40 min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {isLoading ? (
            <p className="text-muted-foreground text-[12px]">loading activity…</p>
          ) : ordered.length ? (
            <div className="space-y-3">
              {ordered.map((log) => (
                <StepLine key={log.id} log={log} isLatest={log.id === latest?.id} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-[12px]">
              Connect to server or manage the gateway to see the latest run here.
            </p>
          )}
        </div>
      </Panel>
    </aside>
  );
}

function operationTitle(operation: string): string {
  if (operation === 'validate') return 'Connection check';
  if (operation.startsWith('proxy.')) {
    const action = operation.replace('proxy.', '');
    if (action === 'start') return 'Turn on gateway';
    if (action === 'stop') return 'Turn off gateway';
    if (action === 'restart') return 'Reload gateway';
    return `Gateway ${action}`;
  }
  if (operation === 'cleanup') return 'Cleanup server';
  return operation;
}

function stepState(log: ServerOperationLog, isLatest: boolean): 'done' | 'running' | 'error' {
  if (log.level === 'error') return 'error';
  const doneWords = ['queued', 'ok', 'ready', 'completed', 'started', 'stopped', 'installed'];
  if (doneWords.some((word) => log.message.toLowerCase().includes(word))) return 'done';
  return isLatest ? 'running' : 'done';
}

function StepLine({ log, isLatest }: { log: ServerOperationLog; isLatest: boolean }) {
  const state = stepState(log, isLatest);
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {state === 'error' ? (
          <X className="text-destructive size-4" />
        ) : state === 'running' ? (
          <LoaderCircle className="text-phosphor size-4 animate-spin" />
        ) : (
          <Check className="text-phosphor size-4" />
        )}
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            'text-[12.5px] leading-5',
            state === 'error' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {log.message}
        </div>
        <div className="text-muted-foreground mt-0.5 text-[10px]">
          <LocalDateTime value={log.createdAt} style="time" />
        </div>
      </div>
    </div>
  );
}
