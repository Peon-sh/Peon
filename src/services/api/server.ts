import { api, unwrap } from '@/lib/http/axios';

export type ProxyType = 'TRAEFIK' | 'CADDY' | 'NONE';

export interface ServerSettingSummary {
  id: string;
  wildcardDomain: string | null;
  isReachable: boolean;
  isUsable: boolean;
  forceDisabled: boolean;
  concurrentBuilds: number;
  deploymentQueueLimit: number;
  connectionTimeout: number;
  isMetricsEnabled: boolean;
  isSentinelEnabled: boolean;
  isTerminalEnabled: boolean;
  isCloudflareTunnel: boolean;
  isJumpServer: boolean;
  forceDockerCleanup: boolean;
  dockerCleanupFrequency: string;
  dockerCleanupThreshold: number;
  deleteUnusedVolumes: boolean;
  deleteUnusedNetworks: boolean;
  diskUsageNotificationThreshold: number;
  agentLastSeenAt?: string | null;
  agentVersion?: string | null;
  agentHostMetrics?: {
    cpu_percent?: number;
    memory_percent?: number;
    disk_percent_root?: number;
    uptime_seconds?: number;
  } | null;
  agentContainers?: Array<{
    name: string;
    state: string;
    health?: string;
    image: string;
  }> | null;
  /** Derived: agent pushed within the last ~2.5 minutes. */
  isAgentLive?: boolean;
}

export interface Destination {
  id: string;
  uuid: string;
  name: string;
  network: string;
  isSwarm: boolean;
  createdAt: string;
}

export interface ServerListItem {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  ip: string;
  port: number;
  user: string;
  privateKeyId: string | null;
  proxyType: ProxyType;
  proxyStatus: string;
  isBuildServer: boolean;
  isSwarmManager: boolean;
  isSwarmWorker: boolean;
  highDiskUsage: boolean;
  isReachable: boolean;
  isUsable: boolean;
  createdAt: string;
  settings: ServerSettingSummary | null;
  privateKey: { id: string; name: string; fingerprint: string | null } | null;
  _count: { destinations: number; services: number };
}

export interface ServerDetail {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  ip: string;
  port: number;
  user: string;
  privateKeyId: string | null;
  /** Trusted SSH host key. Null until the first successful connection records it. */
  hostKeyFingerprint: string | null;
  proxyType: ProxyType;
  proxyStatus: string;
  isBuildServer: boolean;
  isSwarmManager: boolean;
  isSwarmWorker: boolean;
  highDiskUsage: boolean;
  isReachable: boolean;
  isUsable: boolean;
  createdAt: string;
  settings: ServerSettingSummary | null;
  destinations: Destination[];
  privateKey: { id: string; name: string; fingerprint: string | null } | null;
  /** Active services on this server (detail endpoint). */
  resourceCount?: number;
  _count?: { services: number };
}

export interface ServerOperationLog {
  id: string;
  sessionId: string | null;
  operation: string;
  level: string;
  message: string;
  createdAt: string;
}

export interface CreateServerPayload {
  name: string;
  description?: string;
  ip: string;
  port: number;
  user: string;
  privateKeyId: string;
  proxyType: ProxyType;
  hostKeyFingerprint?: string;
}

export interface UpdateServerPayload {
  name?: string;
  description?: string | null;
  ip?: string;
  port?: number;
  user?: string;
  privateKeyId?: string | null;
  proxyType?: ProxyType;
  /** Null clears the trusted key so a rebuilt server can be re-trusted. */
  hostKeyFingerprint?: string | null;
  isBuildServer?: boolean;
  forceDisabled?: boolean;
  wildcardDomain?: string | null;
  connectionTimeout?: number;
  concurrentBuilds?: number;
  deploymentQueueLimit?: number;
  isMetricsEnabled?: boolean;
  isSentinelEnabled?: boolean;
  isTerminalEnabled?: boolean;
  isCloudflareTunnel?: boolean;
  forceDockerCleanup?: boolean;
  dockerCleanupFrequency?: string;
  dockerCleanupThreshold?: number;
  deleteUnusedVolumes?: boolean;
  deleteUnusedNetworks?: boolean;
  diskUsageNotificationThreshold?: number;
}

export function listServers(workspaceId: string) {
  return unwrap<ServerListItem[]>(api.get(`/workspaces/${workspaceId}/servers`));
}

export function createServer(workspaceId: string, input: CreateServerPayload) {
  return unwrap<ServerDetail>(api.post(`/workspaces/${workspaceId}/servers`, input));
}

export function getServer(serverId: string) {
  return unwrap<ServerDetail>(api.get(`/servers/${serverId}`));
}

export function updateServer(serverId: string, input: UpdateServerPayload) {
  return unwrap<ServerDetail>(api.patch(`/servers/${serverId}`, input));
}

export function deleteServer(
  serverId: string,
  input: { confirmName: string; deleteResources?: boolean },
) {
  return unwrap(api.delete(`/servers/${serverId}`, { data: input }));
}

export function validateServer(
  serverId: string,
  input?: {
    ip?: string;
    port?: number;
    user?: string;
    privateKeyId?: string | null;
    connectionTimeout?: number;
    installDocker?: boolean;
  },
) {
  return unwrap(api.post(`/servers/${serverId}/validate`, input ?? {}));
}

export function proxyAction(serverId: string, action: 'start' | 'stop' | 'restart') {
  return unwrap(api.post(`/servers/${serverId}/proxy`, { action }));
}

export function cleanupServer(serverId: string) {
  return unwrap(api.post(`/servers/${serverId}/cleanup`, {}));
}

export function listServerLogs(serverId: string) {
  return unwrap<ServerOperationLog[]>(api.get(`/servers/${serverId}/logs`));
}

export function listDestinations(serverId: string) {
  return unwrap<Destination[]>(api.get(`/servers/${serverId}/destinations`));
}

export function createDestination(
  serverId: string,
  input: { name: string; network: string; isSwarm?: boolean },
) {
  return unwrap<Destination>(api.post(`/servers/${serverId}/destinations`, input));
}

export function deleteDestination(serverId: string, destinationId: string) {
  return unwrap(api.delete(`/servers/${serverId}/destinations/${destinationId}`));
}

export interface ServerTerminalSession {
  ticket: string;
  wsUrl: string;
  port: number;
}

export function createServerTerminalSession(
  serverId: string,
  input?: { cols?: number; rows?: number },
) {
  return unwrap<ServerTerminalSession>(
    api.post(`/servers/${serverId}/terminal`, input ?? {}),
  );
}
