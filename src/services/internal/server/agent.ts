import { randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { serverEnv } from '@/lib/env';
import { AppError, NotFoundError, UnauthorizedError } from '@/lib/errors';

export type AgentHostMetrics = {
  cpu_percent: number;
  memory_percent: number;
  disk_percent_root: number;
  uptime_seconds: number;
};

export type AgentContainer = {
  name: string;
  state: string;
  health?: string;
  image: string;
};

export type AgentPushPayload = {
  schema_version: number;
  server_id: string;
  agent_version: string;
  sent_at: string;
  host: AgentHostMetrics;
  containers: AgentContainer[];
};

/** Seconds after last push before agent is considered offline. */
export const AGENT_STALE_SECONDS = 150;

export function agentPushEndpoint(): string {
  return `${serverEnv().APP_URL.replace(/\/$/, '')}/api/v1/agents/push`;
}

export function generateAgentToken(): string {
  return randomBytes(32).toString('base64url');
}

export function encryptAgentToken(plaintext: string): string {
  return encrypt(plaintext);
}

export function decryptAgentToken(stored: string): string {
  try {
    return decrypt(stored);
  } catch {
    // Legacy / plaintext tokens
    return stored;
  }
}

export function tokensMatch(storedEncryptedOrPlain: string, bearer: string): boolean {
  const expected = decryptAgentToken(storedEncryptedOrPlain);
  const a = Buffer.from(expected);
  const b = Buffer.from(bearer);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAgentLive(lastSeenAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!lastSeenAt) return false;
  const t = typeof lastSeenAt === 'string' ? new Date(lastSeenAt) : lastSeenAt;
  if (Number.isNaN(t.getTime())) return false;
  return now.getTime() - t.getTime() <= AGENT_STALE_SECONDS * 1000;
}

/**
 * Ensure the server has an agent token and isSentinelEnabled=true.
 * Returns the plaintext token for remote install.
 */
export async function ensureAgentCredentials(serverId: string): Promise<{
  token: string;
  pushEndpoint: string;
  serverId: string;
}> {
  const settings = await prisma.serverSetting.findUnique({ where: { serverId } });
  if (!settings) throw new NotFoundError('Server settings not found.');

  let plaintext: string;
  if (settings.sentinelToken) {
    plaintext = decryptAgentToken(settings.sentinelToken);
  } else {
    plaintext = generateAgentToken();
    await prisma.serverSetting.update({
      where: { serverId },
      data: {
        sentinelToken: encryptAgentToken(plaintext),
        isSentinelEnabled: true,
        isMetricsEnabled: true,
      },
    });
    return { token: plaintext, pushEndpoint: agentPushEndpoint(), serverId };
  }

  if (!settings.isSentinelEnabled || !settings.isMetricsEnabled) {
    await prisma.serverSetting.update({
      where: { serverId },
      data: { isSentinelEnabled: true, isMetricsEnabled: true },
    });
  }

  return { token: plaintext, pushEndpoint: agentPushEndpoint(), serverId };
}

/** Apply an authenticated agent push to the database. */
export async function applyAgentPush(authorizationHeader: string | null, payload: AgentPushPayload) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token.');
  }
  const bearer = authorizationHeader.slice('Bearer '.length).trim();
  if (!bearer) throw new UnauthorizedError('Missing bearer token.');

  if (payload.schema_version !== 1) {
    throw new AppError('Unsupported schema_version.', 422, 'UNSUPPORTED_SCHEMA');
  }

  const server = await prisma.server.findFirst({
    where: {
      OR: [{ id: payload.server_id }, { uuid: payload.server_id }],
    },
    include: { settings: true },
  });
  if (!server?.settings) throw new NotFoundError('Server not found.');
  if (!server.settings.sentinelToken) throw new UnauthorizedError('Agent not configured.');
  if (!tokensMatch(server.settings.sentinelToken, bearer)) {
    throw new UnauthorizedError('Invalid agent token.');
  }

  const diskThreshold = server.settings.diskUsageNotificationThreshold ?? 80;
  const highDisk = (payload.host?.disk_percent_root ?? 0) >= diskThreshold;

  await prisma.$transaction([
    prisma.serverSetting.update({
      where: { serverId: server.id },
      data: {
        agentLastSeenAt: new Date(payload.sent_at || Date.now()),
        agentVersion: payload.agent_version || null,
        agentHostMetrics: payload.host ?? {},
        agentContainers: payload.containers ?? [],
        isSentinelEnabled: true,
        isReachable: true,
      },
    }),
    prisma.server.update({
      where: { id: server.id },
      data: {
        isReachable: true,
        highDiskUsage: highDisk,
      },
    }),
  ]);

  return { serverId: server.id };
}
