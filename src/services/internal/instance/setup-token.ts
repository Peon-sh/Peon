import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { serverEnv } from '@/lib/env';
import { ForbiddenError } from '@/lib/errors';

/**
 * First-administrator bootstrap.
 *
 * A fresh installation has no users and, typically, no working email — so the
 * normal OTP signup cannot run. The alternative most products choose is shipping
 * `admin@example.com` / `password123`, which is then never changed. This is the
 * safer version:
 *
 * - The token is 32 random bytes, printed once by the installer.
 * - Only its SHA-256 hash is stored, so a database leak yields nothing usable.
 * - It expires (default 24h) and is single-use.
 * - It is refused the moment any user exists, so it cannot be replayed later to
 *   mint a second administrator on a live instance.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time compare of two hex digests of equal length. */
function digestsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

export interface IssuedSetupToken {
  token: string;
  url: string;
  expiresAt: Date;
  reused: boolean;
}

/**
 * Issue a setup token, or return the existing valid one.
 *
 * Idempotent so re-running the installer does not mint a second token or
 * invalidate a link the operator has already copied.
 */
export async function issueSetupToken(): Promise<IssuedSetupToken | null> {
  const userCount = await prisma.user.count();
  if (userCount > 0) return null;

  const existing = await prisma.setupToken.findFirst({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    // The plaintext was never stored, so an existing token cannot be reprinted.
    // Expire it and issue a fresh one rather than leaving the operator stuck.
    await prisma.setupToken.update({
      where: { id: existing.id },
      data: { expiresAt: new Date() },
    });
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.setupToken.create({
    data: { tokenHash: hashToken(token), expiresAt },
  });

  const base = serverEnv().APP_URL.replace(/\/$/, '');
  return {
    token,
    url: `${base}/setup/${token}`,
    expiresAt,
    reused: false,
  };
}

/** Validate without consuming. Used to render the setup page. */
export async function verifySetupToken(token: string): Promise<boolean> {
  if (!token) return false;
  if ((await prisma.user.count()) > 0) return false;

  const row = await prisma.setupToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { tokenHash: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;

  return digestsMatch(row.tokenHash, hashToken(token));
}

/**
 * Consume the token. Throws unless it is valid *and* the instance still has no
 * users, so a leaked token cannot mint a second administrator later.
 */
export async function consumeSetupToken(token: string): Promise<void> {
  if (!(await verifySetupToken(token))) {
    throw new ForbiddenError('This setup link is invalid, expired or already used.', 'SETUP_TOKEN_INVALID');
  }

  // Conditional update: two concurrent requests cannot both consume it.
  const claimed = await prisma.setupToken.updateMany({
    where: { tokenHash: hashToken(token), usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ForbiddenError('This setup link has already been used.', 'SETUP_TOKEN_INVALID');
  }
}

/** Remove expired and used tokens. */
export async function purgeSetupTokens(): Promise<number> {
  const res = await prisma.setupToken.deleteMany({
    where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }] },
  });
  return res.count;
}
