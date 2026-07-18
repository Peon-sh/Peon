import { prisma } from '@/lib/prisma';
import type { AuthSession } from '@/lib/prisma';
import {
  extractSessionMeta,
  type SessionRequestMeta,
} from '@/lib/auth/session-meta';
import { NotFoundError, UnauthorizedError } from '@/lib/errors';

export const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000;

export type AuthSessionDto = {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  acceptLanguage: string | null;
  browser: string | null;
  browserEngine: string | null;
  os: string | null;
  deviceType: string | null;
  deviceName: string | null;
  platform: string | null;
  country: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

function toDto(session: AuthSession, currentSid: string | null): AuthSessionDto {
  return {
    id: session.id,
    current: currentSid === session.id,
    ip: session.ip,
    userAgent: session.userAgent,
    acceptLanguage: session.acceptLanguage,
    browser: session.browser,
    browserEngine: session.browserEngine,
    os: session.os,
    deviceType: session.deviceType,
    deviceName: session.deviceName,
    platform: session.platform,
    country: session.country,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

export const AuthSessionService = {
  metaFromHeaders(headers: Headers): SessionRequestMeta {
    return extractSessionMeta(headers);
  },

  async create(userId: string, meta: SessionRequestMeta): Promise<AuthSession> {
    const now = new Date();
    return prisma.authSession.create({
      data: {
        userId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        acceptLanguage: meta.acceptLanguage,
        browser: meta.browser,
        browserEngine: meta.browserEngine,
        os: meta.os,
        deviceType: meta.deviceType,
        deviceName: meta.deviceName,
        platform: meta.platform,
        country: meta.country,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + AUTH_SESSION_TTL_MS),
      },
    });
  },

  /**
   * Returns the session when valid; null when missing / revoked / expired.
   * Throttles lastSeenAt (+ IP if changed).
   */
  async assertActive(
    sid: string | undefined | null,
    opts?: { ip?: string | null },
  ): Promise<AuthSession | null> {
    if (!sid) return null;
    const session = await prisma.authSession.findUnique({ where: { id: sid } });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;

    const now = new Date();
    const stale = now.getTime() - session.lastSeenAt.getTime() >= LAST_SEEN_THROTTLE_MS;
    const ipChanged = opts?.ip && opts.ip !== session.ip;
    if (stale || ipChanged) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          ...(ipChanged ? { ip: opts!.ip! } : {}),
        },
      });
    }
    return session;
  },

  async listActive(userId: string, currentSid: string | null): Promise<AuthSessionDto[]> {
    const rows = await prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((row) => toDto(row, currentSid));
  },

  async revoke(userId: string, sessionId: string): Promise<void> {
    const session = await prisma.authSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundError('Session not found');
    if (!session.revokedAt) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }
  },

  async revokeOthers(userId: string, currentSid: string): Promise<number> {
    const result = await prisma.authSession.updateMany({
      where: {
        userId,
        id: { not: currentSid },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },

  async revokeAll(userId: string): Promise<number> {
    const result = await prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },

  async requireSid(sid: string | undefined | null): Promise<string> {
    if (!sid) throw new UnauthorizedError('Session expired. Please sign in again.');
    return sid;
  },
};
